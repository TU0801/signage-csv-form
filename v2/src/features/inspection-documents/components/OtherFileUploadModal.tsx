import { useMemo, useRef, useState } from 'react';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { Spinner } from '@/components/ui/Spinner';
import { useToast } from '@/components/ui/Toast';
import { cn } from '@/lib/utils';
import { entryErrorReason } from '@/lib/api/admin-entries';
import { recordCorrections, registerPropertyFile } from '@/lib/api/property-files';
import type { PropertyFileCategory } from '@/types/portal';
import { todayJst } from '@/features/inspection-portal/lib/schedule';
import { formatBytes } from '../lib/documents';
import {
  correctionRecord,
  postProcessOcr,
  type CorrectionRecord,
  type PropertyCandidate,
  type VendorCandidate,
} from '../lib/aiOcr';
import {
  PROPERTY_FILE_ACCEPT,
  PROPERTY_FILE_CATEGORIES,
  propertyFileDisplayName,
  propertyFileMime,
  validatePropertyFile,
} from '../lib/propertyFiles';
import { openPdfPages } from '../lib/pdfPages';
import { readImageForOcr, readPdfForOcr, type OcrReadResult } from '../lib/runOcr';
import { useAiOcr } from '../hooks/useAiOcr';
import { AiOcrControls, OcrSummary, type OcrState } from './AiOcrControls';

export interface OtherFileUploadModalProps {
  open: boolean;
  onClose: () => void;
  /** 選べる建物（範囲内の点検の物件）。保守会社は自社の点検がある物件、管理会社は自社物件、管理者は全件 */
  properties: PropertyCandidate[];
  /** AI-OCR の会社名の照合に使う保守会社 */
  vendors?: VendorCandidate[];
  /** AI-OCR の点検種別の照合に使う点検種別名 */
  inspectionTypes?: string[];
  /** 開いたときに選んでおく建物 */
  defaultPropertyCode?: string | null;
  onUploaded?: () => void;
}

/** 『その他ファイルアップロード』（見積書・請求書・契約書・建物関連情報・提案書・写真・その他）。1つの建物に1つ以上のファイルを登録する */
export function OtherFileUploadModal(props: OtherFileUploadModalProps) {
  if (!props.open) return null;
  return <OtherFileUploadDialog {...props} />;
}

type FileResult = { state: 'running' } | { state: 'ok' } | { state: 'error'; message: string };

function OtherFileUploadDialog({
  onClose,
  properties,
  vendors = [],
  inspectionTypes = [],
  defaultPropertyCode,
  onUploaded,
}: OtherFileUploadModalProps) {
  const { addToast } = useToast();
  const ai = useAiOcr();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [category, setCategory] = useState<PropertyFileCategory | ''>('');
  const [categoryNote, setCategoryNote] = useState('');
  const [propertyCode, setPropertyCode] = useState(defaultPropertyCode ?? '');
  const [propertyFilter, setPropertyFilter] = useState('');
  const [docDate, setDocDate] = useState('');
  const [note, setNote] = useState('');
  const [files, setFiles] = useState<File[]>([]);
  const [fileError, setFileError] = useState<string | null>(null);
  const [useAi, setUseAi] = useState(false);
  const [ocr, setOcr] = useState<OcrState>({ state: 'idle' });
  const [ocrRaw, setOcrRaw] = useState<OcrReadResult | null>(null);
  const [touched, setTouched] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [results, setResults] = useState<Record<number, FileResult>>({});

  const visibleProperties = useMemo(() => {
    const q = propertyFilter.trim();
    const list = q ? properties.filter((p) => p.name.includes(q) || p.code.includes(q)) : properties;
    // 選んでいる建物は絞り込みで隠さない
    const chosen = properties.find((p) => p.code === propertyCode);
    return chosen && !list.includes(chosen) ? [chosen, ...list] : list;
  }, [properties, propertyFilter, propertyCode]);

  const errors = {
    category: !category ? '区分を選んでください' : category === 'other' && !categoryNote.trim() ? '「その他」の内容を入力してください' : null,
    property: !propertyCode ? '建物を選んでください' : null,
    files: files.length === 0 ? 'ファイルを追加してください' : null,
  };
  const hasErrors = Object.values(errors).some(Boolean);
  const allDone = files.length > 0 && files.every((_, i) => results[i]?.state === 'ok');

  /** 読み取った結果を、まだ入れていない欄の初期値にする（人が入れた値は変えない） */
  const applySuggestion = (read: OcrReadResult) => {
    const suggestion = postProcessOcr(read.raw, {
      properties,
      vendors,
      inspectionTypes,
      dictionary: ai.dictionary,
      pageTexts: read.pageTexts,
    });
    setOcr({ state: 'done', suggestion, mode: read.mode, pages: read.pages });
    setOcrRaw(read);
    if (!category) {
      setCategory(suggestion.category);
      if (suggestion.category === 'other' && !categoryNote) setCategoryNote(suggestion.categoryNote);
    }
    if (!propertyCode && suggestion.property) setPropertyCode(suggestion.property.code);
    if (!docDate && suggestion.performedOn) setDocDate(suggestion.performedOn);
  };

  const runOcr = async (target: File, withAi: boolean) => {
    const isPdf = propertyFileMime(target.name) === 'application/pdf';
    const isImage = /^image\/(jpeg|png)$/.test(propertyFileMime(target.name) ?? '');
    if (!isPdf && !(withAi && isImage)) {
      setOcr({ state: 'error', message: withAi ? 'PDF・JPG・PNG だけ読み取れます' : '文字情報から読み取れるのは PDF だけです' });
      return;
    }
    setOcr({ state: 'running', useAi: withAi });
    try {
      let read: OcrReadResult;
      if (isPdf) {
        const bytes = new Uint8Array(await target.arrayBuffer());
        const pages = await openPdfPages(bytes.slice());
        try {
          read = await readPdfForOcr(pages, bytes, withAi);
        } finally {
          pages.destroy();
        }
      } else {
        read = await readImageForOcr(target);
      }
      applySuggestion(read);
    } catch (err) {
      console.error('OCR failed:', err);
      setOcr({ state: 'error', message: entryErrorReason(err) });
    }
  };

  const addFiles = (picked: FileList | null) => {
    if (!picked || picked.length === 0) return;
    const list = [...picked];
    const bad = list.map((f) => ({ f, e: validatePropertyFile(f) })).find((x) => x.e);
    if (bad) {
      setFileError(`${bad.f.name}: ${bad.e}`);
      return;
    }
    setFileError(null);
    const next = [...files, ...list];
    setFiles(next);
    // AI-OCR は最初のファイルで読む（1つの建物・区分の書類をまとめて登録する前提）
    if (useAi && ai.configured && files.length === 0 && list[0]) void runOcr(list[0], true);
  };

  const removeFile = (index: number) => {
    setFiles((prev) => prev.filter((_, i) => i !== index));
    setResults({});
  };

  const handleSubmit = async () => {
    setTouched(true);
    if (hasErrors || !category) return;
    setSubmitting(true);
    let ok = 0;
    let failed = 0;
    for (const [i, file] of files.entries()) {
      if (results[i]?.state === 'ok') continue;
      setResults((prev) => ({ ...prev, [i]: { state: 'running' } }));
      try {
        // OS によって File.type が空・違う値になるので、拡張子から決めた MIME で置く
        const mime = propertyFileMime(file.name) ?? file.type;
        const typed = file.type === mime ? file : new File([file], file.name, { type: mime });
        await registerPropertyFile({
          propertyCode,
          category,
          categoryNote: category === 'other' ? categoryNote.trim() : null,
          fileName: propertyFileDisplayName(file.name),
          file: typed,
          docDate: docDate || null,
          note: note.trim() || null,
          ocrResult: i === 0 && ocrRaw ? ocrRaw.raw : null,
        });
        ok += 1;
        setResults((prev) => ({ ...prev, [i]: { state: 'ok' } }));
      } catch (err) {
        failed += 1;
        console.error('Property file upload failed:', err);
        setResults((prev) => ({ ...prev, [i]: { state: 'error', message: entryErrorReason(err) } }));
      }
    }
    setSubmitting(false);
    if (ok > 0) {
      onUploaded?.();
      // 自己改善: AI が読んだ建物名・書類の種類と、人が確定した建物・区分を記録する（次から同じ読みに当てる）
      if (ocr.state === 'done') {
        const s = ocr.suggestion;
        const records = [
          ...s.pages.map((p) => correctionRecord('property', p.buildingRead, p.property?.code ?? null, propertyCode)),
          correctionRecord('category', s.documentType, s.category, category),
        ].filter((r): r is CorrectionRecord => !!r);
        void recordCorrections(records);
      }
    }
    if (failed === 0) addToast(`${ok}件のファイルを登録しました`, 'success');
    else addToast(`${ok}件を登録し、${failed}件は失敗しました（失敗したファイルは再送できます）`, 'warning');
  };

  const today = todayJst();
  const firstFile = files[0];

  return (
    <Modal
      open
      onClose={onClose}
      title="その他ファイルアップロード"
      className="max-w-3xl"
      dirty={files.length > 0 && !allDone && !submitting}
      busy={submitting}
      footer={
        <>
          <Button variant="secondary" size="sm" onClick={onClose} disabled={submitting}>
            {allDone ? '閉じる' : 'キャンセル'}
          </Button>
          {!allDone && (
            <Button size="sm" onClick={() => void handleSubmit()} disabled={submitting}>
              {submitting ? '送信中…' : files.length > 0 ? `${files.length}件を登録する` : '登録する'}
            </Button>
          )}
        </>
      }
    >
      <div className="space-y-2 text-sm">
        <p className="text-xs text-gray-600">
          見積書・請求書・契約書などを建物ごとに保管します。見られるのは、物件の管理会社・管理者・アップロードした会社です。
        </p>

        <fieldset>
          <legend className="mb-0.5 text-xs font-medium text-gray-700">区分</legend>
          <div className="flex flex-wrap items-center gap-1" role="radiogroup" aria-label="区分">
            {PROPERTY_FILE_CATEGORIES.map((c) => (
              <button
                key={c.value}
                type="button"
                role="radio"
                aria-checked={category === c.value}
                disabled={submitting}
                onClick={() => setCategory(c.value)}
                className={cn(
                  'rounded border px-2 py-0.5 text-xs',
                  category === c.value ? 'border-blue-500 bg-blue-50 text-blue-800' : 'border-gray-300 bg-white hover:bg-gray-50',
                )}
              >
                {c.label}
              </button>
            ))}
            {category === 'other' && (
              <input
                type="text"
                aria-label="その他の内容"
                placeholder="内容（自由記入）"
                className="w-48 rounded border border-gray-300 px-1.5 py-0.5 text-xs"
                value={categoryNote}
                maxLength={100}
                onChange={(e) => setCategoryNote(e.target.value)}
                disabled={submitting}
              />
            )}
          </div>
          {touched && errors.category && <p className="mt-0.5 text-[11px] text-red-600">{errors.category}</p>}
        </fieldset>

        <div className="grid grid-cols-1 gap-2 sm:grid-cols-[1fr_9rem]">
          <div>
            <label className="mb-0.5 block text-xs font-medium text-gray-700" htmlFor="other-file-property">
              建物名
            </label>
            <div className="flex gap-1">
              <input
                type="search"
                aria-label="建物の絞り込み"
                placeholder="絞り込み"
                className="w-28 rounded border border-gray-300 px-1.5 py-0.5 text-xs"
                value={propertyFilter}
                onChange={(e) => setPropertyFilter(e.target.value)}
                disabled={submitting}
              />
              <select
                id="other-file-property"
                className={cn(
                  'min-w-0 flex-1 rounded border border-gray-300 px-1 py-0.5 text-xs',
                  touched && errors.property && 'border-red-500',
                )}
                value={propertyCode}
                onChange={(e) => setPropertyCode(e.target.value)}
                disabled={submitting}
              >
                <option value="">建物を選んでください</option>
                {visibleProperties.map((p) => (
                  <option key={p.code} value={p.code}>
                    {p.name}（{p.code}）
                  </option>
                ))}
              </select>
            </div>
            {touched && errors.property && <p className="mt-0.5 text-[11px] text-red-600">{errors.property}</p>}
            {properties.length === 0 && (
              <p className="mt-0.5 text-[11px] text-amber-800">選べる建物がありません（担当の点検が登録されていません）。</p>
            )}
          </div>
          <label className="text-xs font-medium text-gray-700">
            書類の日付
            <input
              type="date"
              className="mt-0.5 block w-full rounded border border-gray-300 px-1 py-0.5 text-xs font-normal"
              value={docDate}
              max="9999-12-31"
              onChange={(e) => setDocDate(e.target.value)}
              disabled={submitting}
            />
            {docDate > today && <span className="text-[11px] font-normal text-amber-700">未来の日付です</span>}
          </label>
        </div>

        <label className="block text-xs font-medium text-gray-700">
          メモ
          <input
            type="text"
            className="mt-0.5 block w-full rounded border border-gray-300 px-1.5 py-0.5 text-xs font-normal"
            value={note}
            maxLength={500}
            onChange={(e) => setNote(e.target.value)}
            disabled={submitting}
          />
        </label>

        <AiOcrControls
          enabled={useAi}
          onToggle={(checked) => {
            setUseAi(checked);
            if (checked && firstFile) void runOcr(firstFile, true);
          }}
          configured={ai.configured}
          checking={ai.checking}
          message={ai.message}
          onReadLocal={firstFile && propertyFileMime(firstFile.name) === 'application/pdf' ? () => void runOcr(firstFile, false) : undefined}
          disabled={submitting}
          ocr={ocr}
        />

        <div>
          <input
            ref={fileInputRef}
            type="file"
            multiple
            accept={PROPERTY_FILE_ACCEPT}
            className="hidden"
            data-testid="other-file-input"
            onChange={(e) => {
              addFiles(e.target.files);
              e.target.value = '';
            }}
          />
          <Button variant="secondary" size="sm" onClick={() => fileInputRef.current?.click()} disabled={submitting}>
            ファイルを追加
          </Button>
          <span className="ml-2 text-[11px] text-gray-500">PDF・画像（JPG/PNG）・Excel・Word・PowerPoint、1ファイル 50MB まで</span>
          {fileError && (
            <p role="alert" className="mt-0.5 text-xs text-red-600">
              {fileError}
            </p>
          )}
          {touched && errors.files && <p className="mt-0.5 text-[11px] text-red-600">{errors.files}</p>}
          {files.length > 0 && (
            <ul className="mt-1 divide-y divide-gray-100 rounded border border-gray-200 text-xs">
              {files.map((f, i) => {
                const r = results[i];
                return (
                  <li key={`${f.name}-${i}`} className="flex items-center gap-2 px-2 py-0.5" data-testid={`other-file-${i + 1}`}>
                    <span className="min-w-0 flex-1 truncate" title={f.name}>
                      {f.name}
                    </span>
                    <span className="text-gray-500">{formatBytes(f.size)}</span>
                    <span aria-live="polite" className="w-56 text-right">
                      {r?.state === 'running' && (
                        <span className="inline-flex items-center gap-1 text-gray-600">
                          <Spinner size="sm" />
                          送信中…
                        </span>
                      )}
                      {r?.state === 'ok' && <span className="text-green-700">登録しました</span>}
                      {r?.state === 'error' && <span className="break-all text-red-600">失敗: {r.message}</span>}
                    </span>
                    {r?.state !== 'ok' && (
                      <button
                        type="button"
                        className="text-gray-400 hover:text-red-600 disabled:opacity-40"
                        aria-label={`${f.name} を外す`}
                        disabled={submitting}
                        onClick={() => removeFile(i)}
                      >
                        ×
                      </button>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        <OcrSummary ocr={ocr} />
      </div>
    </Modal>
  );
}
