import { useMemo, useRef, useState } from 'react';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { Spinner } from '@/components/ui/Spinner';
import { Combobox, type ComboboxOption } from '@/components/ui/Combobox';
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
  buildPropertyFileName,
  propertyFileCategoryLabel,
  propertyFileMime,
  validatePropertyFile,
} from '../lib/propertyFiles';
import { openPdfPages } from '../lib/pdfPages';
import { readImageForOcr, readPdfForOcr, readPeriodStartFromPdf, type OcrReadResult } from '../lib/runOcr';
import { useAiOcr } from '../hooks/useAiOcr';
import { usePropertyFileTargets } from '../hooks/usePropertyFileTargets';
import { AiOcrControls, OcrSummary, type OcrState } from './AiOcrControls';
import { FilePreview } from './FilePreview';

export interface OtherFileUploadModalProps {
  open: boolean;
  onClose: () => void;
  /**
   * 選べる建物の追加の候補（範囲内の点検の物件）。開いたときに DB の「置ける建物」（保守会社は自社の点検がある物件、
   * 管理会社は点検行の無いものを含む自社物件、管理者は全件）も読んで合わせる
   */
  properties?: PropertyCandidate[];
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

const NO_PROPERTIES: PropertyCandidate[] = [];

function OtherFileUploadDialog({
  onClose,
  properties: propertyHints = NO_PROPERTIES,
  vendors = [],
  inspectionTypes = [],
  defaultPropertyCode,
  onUploaded,
}: OtherFileUploadModalProps) {
  const { addToast } = useToast();
  const ai = useAiOcr();
  const properties = usePropertyFileTargets(propertyHints);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [category, setCategory] = useState<PropertyFileCategory | ''>('');
  const [categoryNote, setCategoryNote] = useState('');
  const [propertyCode, setPropertyCode] = useState(defaultPropertyCode ?? '');
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
  /** プレビューに出すファイル（一覧の名前を押して切り替える。既定は最初のファイル） */
  const [previewIndex, setPreviewIndex] = useState(0);

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
    // AI を使わないときも、最初の PDF の文字情報に期間があれば前半の日付を作業実施日の初期値にする（費用なし。修正依頼1026 J4）。
    // 期間が無い・PDF でないときは今日の日付にする（修正依頼1027(5)。入れてある日付は変えない）
    else if (files.length === 0 && !docDate && list[0]) {
      const today = todayJst();
      if (propertyFileMime(list[0].name) === 'application/pdf') {
        void readPeriodStartFromPdf(list[0])
          .then((start) => setDocDate((cur) => cur || start || today))
          .catch((err: unknown) => {
            console.error('Period read failed:', err);
            setDocDate((cur) => cur || today);
          });
      } else setDocDate(today);
    }
  };

  const removeFile = (index: number) => {
    setFiles((prev) => prev.filter((_, i) => i !== index));
    setResults({});
    setPreviewIndex(0);
  };

  const handleSubmit = async () => {
    setTouched(true);
    if (hasErrors || !category) return;
    setSubmitting(true);
    let ok = 0;
    let failed = 0;
    const propertyName = properties.find((p) => p.code === propertyCode)?.name ?? '';
    const categoryLabel = propertyFileCategoryLabel({ category, category_note: category === 'other' ? categoryNote.trim() : null });
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
          // 作業実施日があれば「作業実施日_建物名_区分」に付け替える（修正依頼1026 J4）
          fileName: buildPropertyFileName({
            docDate,
            propertyName,
            categoryLabel,
            originalName: file.name,
            index: i,
            total: files.length,
          }),
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
  const previewFile = files[previewIndex] ?? firstFile ?? null;
  const propertyOptions = useMemo<ComboboxOption[]>(
    () => properties.map((p) => ({ value: p.code, label: p.name, hint: p.code })),
    [properties],
  );

  return (
    <Modal
      open
      onClose={onClose}
      title="その他ファイルアップロード"
      className="max-w-5xl"
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

        {/* 左に選んだファイルのプレビュー、右に入力欄（DocFlow の配置。修正依頼1026 J3） */}
        <div className="grid grid-cols-1 gap-3 md:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)]">
          <div className="space-y-1">
            <FilePreview file={previewFile} />
            {files.length > 1 && previewFile && (
              <p className="text-[11px] text-gray-500">プレビュー: {previewFile.name}（右の一覧の名前を押すと切り替えます）</p>
            )}
          </div>

          <div className="space-y-2">
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
                      category === c.value
                        ? 'border-blue-500 bg-blue-50 text-blue-800'
                        : 'field-required border-gray-300 hover:bg-gray-50',
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
                    className="field-required w-48 rounded border border-gray-300 px-1.5 py-0.5 text-xs"
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
              {/* 建物名は1つの「検索して選ぶ」欄（修正依頼1026 J1） */}
              <div>
                <Combobox
                  id="other-file-property"
                  label="建物名"
                  placeholder="建物名・コードで検索して選ぶ"
                  options={propertyOptions}
                  value={propertyCode}
                  onChange={setPropertyCode}
                  disabled={submitting}
                  className="field-required"
                  error={touched && errors.property ? errors.property : undefined}
                />
                <p className="mt-0.5 text-[11px] text-gray-500">※リストにない建物は建物追加申請をお願いします。</p>
                {properties.length === 0 && (
                  <p className="mt-0.5 text-[11px] text-amber-800">選べる建物がありません（担当の点検・管理する建物が登録されていません）。</p>
                )}
              </div>
              <label className="text-xs font-medium text-gray-600">
                作業実施日
                <input
                  type="date"
                  className="mt-0.5 block w-full rounded border border-gray-300 px-1 py-1 text-xs font-normal"
                  value={docDate}
                  max="9999-12-31"
                  onChange={(e) => setDocDate(e.target.value)}
                  disabled={submitting}
                />
                {docDate > today && <span className="text-[11px] font-normal text-amber-700">未来の日付です</span>}
              </label>
            </div>
            <p className="-mt-1 text-[11px] text-gray-500">
              期間の書類（例 2026年9月1日～2026年9月30日）は前半の日付が入ります。作業実施日を入れると、保存するファイル名は「作業実施日_建物名_区分」になります。
            </p>

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
              <Button
                variant="secondary"
                size="sm"
                onClick={() => fileInputRef.current?.click()}
                disabled={submitting}
              >
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
                      <li
                        key={`${f.name}-${i}`}
                        className={cn('flex items-center gap-2 px-2 py-0.5', f === previewFile && 'bg-blue-50')}
                        data-testid={`other-file-${i + 1}`}
                      >
                        <button
                          type="button"
                          className="min-w-0 flex-1 truncate text-left hover:underline"
                          title={`${f.name}（押すとプレビュー）`}
                          onClick={() => setPreviewIndex(i)}
                        >
                          {f.name}
                        </button>
                        <span className="text-gray-500">{formatBytes(f.size)}</span>
                        <span aria-live="polite" className="w-40 text-right">
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
        </div>
      </div>
    </Modal>
  );
}
