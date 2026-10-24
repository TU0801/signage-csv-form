import { useEffect, useMemo, useRef, useState } from 'react';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { Spinner } from '@/components/ui/Spinner';
import { useToast } from '@/components/ui/Toast';
import { cn } from '@/lib/utils';
import { registerInspectionReport } from '@/lib/api/portal';
import { entryErrorReason } from '@/lib/api/admin-entries';
import { usePortalData } from '@/features/inspection-portal/hooks/usePortalData';
import { formatMonth, todayJst } from '@/features/inspection-portal/lib/schedule';
import { buildReportFileName } from '../lib/fileName';
import { formatBytes } from '../lib/documents';
import { validateReportFile } from '../lib/upload';
import { openPdfPages, type PdfPages } from '../lib/pdfPages';
import { extractRange, loadSourcePdf } from '../lib/pdfSplit';
import {
  EMPTY_INPUT,
  buildSegments,
  buildTargets,
  effectivePerformedOn,
  effectiveTargetMonth,
  existingReport,
  pageLabel,
  toggleBreak,
  validateSegments,
  type BulkTarget,
  type Segment,
  type SegmentInput,
} from '../lib/bulkSegments';

export interface BulkReportUploadModalProps {
  open: boolean;
  onClose: () => void;
  /** 対象の保守会社（管理者は選択中の会社、保守会社アカウントは自社）。null なら範囲内の全社の点検 */
  vendorId: string | null;
  onUploaded?: () => void;
}

/** 複数物件をまとめた1つの PDF を、プレビューを見ながら区間に分けて点検ごとに登録する */
export function BulkReportUploadModal(props: BulkReportUploadModalProps) {
  // 開くたびに入力と読み込みをやり直す（閉じている間は点検一覧も読まない）
  if (!props.open) return null;
  return <BulkReportUploadDialog {...props} />;
}

const THUMB_WIDTH = 120;

/** 区間の見分けに使う色（区間番号の順にくり返す） */
const SEGMENT_COLORS = [
  'border-blue-400 bg-blue-50 text-blue-800',
  'border-emerald-400 bg-emerald-50 text-emerald-800',
  'border-amber-400 bg-amber-50 text-amber-800',
  'border-fuchsia-400 bg-fuchsia-50 text-fuchsia-800',
  'border-cyan-400 bg-cyan-50 text-cyan-800',
];
const colorOf = (no: number) => SEGMENT_COLORS[(no - 1) % SEGMENT_COLORS.length];

type SegmentResult =
  | { state: 'running' }
  | { state: 'ok'; fileName: string }
  | { state: 'error'; message: string };

interface LoadedPdf {
  file: File;
  pages: PdfPages;
  /** pdf-lib で切り出す元（pdfjs へ渡した buffer は worker へ移って使えなくなるので別に持つ） */
  bytes: Uint8Array;
}

function BulkReportUploadDialog({ onClose, vendorId, onUploaded }: BulkReportUploadModalProps) {
  const { addToast } = useToast();
  const data = usePortalData();
  const today = todayJst();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [pdf, setPdf] = useState<LoadedPdf | null>(null);
  const [opening, setOpening] = useState(false);
  const [fileError, setFileError] = useState<string | null>(null);
  const [rotations, setRotations] = useState<Record<number, number>>({});
  const [breaks, setBreaks] = useState<Set<number>>(new Set());
  const [inputs, setInputs] = useState<Record<number, SegmentInput>>({});
  const [defaultPerformedOn, setDefaultPerformedOn] = useState('');
  const [touched, setTouched] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [results, setResults] = useState<Record<number, SegmentResult>>({});

  // 閉じたら pdfjs の文書を片付ける
  useEffect(() => () => pdf?.pages.destroy(), [pdf]);

  const targets = useMemo(
    () => buildTargets(data.inspections, data.entries, data.reports, vendorId, today),
    [data.inspections, data.entries, data.reports, vendorId, today],
  );
  const targetMap = useMemo(() => new Map(targets.map((t) => [t.key, t])), [targets]);
  const groups = useMemo(() => {
    const m = new Map<string, BulkTarget[]>();
    for (const t of targets) m.set(t.group, [...(m.get(t.group) ?? []), t]);
    return [...m.entries()];
  }, [targets]);

  const pageCount = pdf?.pages.pageCount ?? 0;
  const segments = useMemo(() => buildSegments(pageCount, breaks), [pageCount, breaks]);
  const errors = useMemo(
    () => validateSegments(segments, inputs, targetMap, defaultPerformedOn),
    [segments, inputs, targetMap, defaultPerformedOn],
  );
  const segmentOfPage = (page: number) => segments.find((s) => page >= s.start && page <= s.end);
  // 1区間でも登録できたら、ページの区切り・回転は変えない（登録済みの区間と画面の区間がずれないように）
  const locked = Object.values(results).some((r) => r.state === 'ok');
  const pending = segments.filter((s) => results[s.start]?.state !== 'ok');
  const allDone = segments.length > 0 && pending.length === 0;

  const pickFile = async (picked: File | undefined | null) => {
    if (!picked) return;
    const invalid = validateReportFile({ name: picked.name, type: picked.type || 'application/pdf', size: picked.size });
    // 元の PDF は 50MB を超えてもよい（区間ごとに 50MB 以下を確かめる）
    if (invalid && invalid !== 'ファイルが大きすぎます（50MB まで）') {
      setFileError(invalid);
      return;
    }
    setOpening(true);
    setFileError(null);
    try {
      const buf = new Uint8Array(await picked.arrayBuffer());
      const pages = await openPdfPages(buf.slice());
      setPdf({ file: picked, pages, bytes: buf });
      setRotations({});
      setBreaks(new Set());
      setInputs({});
      setResults({});
      setTouched(false);
    } catch (err) {
      console.error('PDF open failed:', err);
      setFileError('PDF を開けませんでした（壊れたファイル・パスワード付きの PDF は扱えません）');
    } finally {
      setOpening(false);
    }
  };

  const setInput = (start: number, patch: Partial<SegmentInput>) =>
    setInputs((prev) => ({ ...prev, [start]: { ...(prev[start] ?? EMPTY_INPUT), ...patch } }));

  const rotate = (page: number, delta: number) =>
    setRotations((prev) => ({ ...prev, [page]: ((((prev[page] ?? 0) + delta) % 360) + 360) % 360 }));

  const handleSubmit = async () => {
    setTouched(true);
    if (!pdf) return;
    const targetsToSend = pending;
    if (targetsToSend.some((s) => errors[s.start])) {
      addToast('直す必要がある区間があります（赤字の区間を確かめてください）', 'error');
      return;
    }
    setSubmitting(true);
    let source;
    try {
      source = await loadSourcePdf(pdf.bytes);
    } catch (err) {
      console.error('PDF load failed:', err);
      addToast('PDF を切り出せませんでした（パスワード付きの PDF は扱えません）', 'error');
      setSubmitting(false);
      return;
    }
    let ok = 0;
    let failed = 0;
    // 区間ごとに順に登録する。途中で失敗しても残りを続け、結果は区間ごとに出す
    for (const seg of targetsToSend) {
      setResults((prev) => ({ ...prev, [seg.start]: { state: 'running' } }));
      const input = inputs[seg.start] ?? EMPTY_INPUT;
      const target = targetMap.get(input.targetKey);
      const performedOn = effectivePerformedOn(input, defaultPerformedOn);
      try {
        if (!target) throw new Error('点検を選んでください');
        const bytes = await extractRange(source, seg, rotations);
        const base = pdf.file.name.replace(/\.pdf$/i, '');
        const file = new File([bytes as BlobPart], `${base}_${pageLabel(seg).replace('p.', 'p')}.pdf`, {
          type: 'application/pdf',
        });
        const invalid = validateReportFile(file);
        if (invalid) throw new Error(`${invalid}（${formatBytes(file.size)}）`);
        const report = await registerInspectionReport({
          inspectionId: target.inspection.inspection_id,
          targetMonth: target.targetMonth,
          performedOn,
          fileName: buildReportFileName({
            performedOn,
            propertyName: target.inspection.property_name,
            inspectionTypeLabel: target.inspection.inspection_type_label ?? '',
          }),
          file,
          entryId: target.entryId,
          note: input.note.trim() || null,
        });
        ok += 1;
        setResults((prev) => ({ ...prev, [seg.start]: { state: 'ok', fileName: report.file_name } }));
      } catch (err) {
        failed += 1;
        console.error('Bulk report upload failed:', err);
        setResults((prev) => ({ ...prev, [seg.start]: { state: 'error', message: entryErrorReason(err) } }));
      }
    }
    setSubmitting(false);
    if (ok > 0) onUploaded?.();
    if (failed === 0) addToast(`${ok}件の報告書を提出しました`, 'success');
    else addToast(`${ok}件を提出し、${failed}件は失敗しました（失敗した区間は直して再送できます）`, 'warning');
  };

  const dirty = !!pdf && !allDone;

  return (
    <Modal
      open
      onClose={onClose}
      title="報告書一括アップロード"
      className="max-w-6xl"
      dirty={dirty && !submitting}
      footer={
        <>
          <Button variant="secondary" size="sm" onClick={onClose} disabled={submitting}>
            {allDone ? '閉じる' : 'キャンセル'}
          </Button>
          {!allDone && (
            <Button size="sm" onClick={() => void handleSubmit()} disabled={submitting || !pdf || segments.length === 0}>
              {submitting
                ? '送信中…'
                : locked
                  ? `残りの${pending.length}区間を提出する`
                  : `${segments.length}区間を提出する`}
            </Button>
          )}
        </>
      }
    >
      <div className="space-y-2 text-sm">
        <p className="text-xs text-gray-600">
          複数の点検の報告書をまとめた PDF を1つ選び、ページの間をクリックして区切りを入れてから、区間ごとに点検を選んで提出します。
          向きが違うページは回転ボタンで直せます（提出する PDF にも反映されます）。
        </p>

        <div className="flex flex-wrap items-end gap-2">
          <div>
            <input
              ref={fileInputRef}
              type="file"
              accept="application/pdf,.pdf"
              className="hidden"
              data-testid="bulk-report-file-input"
              onChange={(e) => {
                void pickFile(e.target.files?.[0]);
                e.target.value = '';
              }}
            />
            <Button
              variant="secondary"
              size="sm"
              onClick={() => fileInputRef.current?.click()}
              disabled={submitting || opening || locked}
            >
              {pdf ? '別の PDF を選ぶ' : 'PDF を選ぶ'}
            </Button>
          </div>
          {pdf && (
            <span className="text-xs text-gray-700">
              {pdf.file.name}（{formatBytes(pdf.file.size)}・{pageCount}ページ）
            </span>
          )}
          {opening && (
            <span className="flex items-center gap-1 text-xs text-gray-600" role="status">
              <Spinner size="sm" />
              PDF を開いています…
            </span>
          )}
          <label className="ml-auto flex items-center gap-1 text-xs text-gray-600">
            実施日（全区間の既定）
            <input
              type="date"
              aria-label="実施日（全区間の既定）"
              className="rounded border border-gray-300 px-1.5 py-0.5 text-xs"
              value={defaultPerformedOn}
              max="9999-12-31"
              onChange={(e) => setDefaultPerformedOn(e.target.value)}
              disabled={submitting}
            />
          </label>
        </div>
        {fileError && (
          <p role="alert" className="text-xs text-red-600">
            {fileError}
          </p>
        )}
        {data.error && (
          <p role="alert" className="text-xs text-red-600">
            点検の一覧を読み込めませんでした（{data.error}）
          </p>
        )}
        {data.loaded && targets.length === 0 && (
          <p className="text-xs text-amber-800">報告書を出せる点検がありません（担当の点検が登録されていません）。</p>
        )}

        {pdf && (
          <>
            <p className="text-xs text-gray-500">
              ページの間の縦の帯をクリックすると区切りを入れる／外すができます。
              {locked && '（提出済みの区間があるため、区切りと回転は変えられません）'}
            </p>
            <div className="flex max-h-[45vh] flex-wrap items-stretch gap-y-2 overflow-y-auto rounded border border-gray-200 bg-gray-50 p-2">
              {Array.from({ length: pageCount }, (_, page) => {
                const seg = segmentOfPage(page);
                return (
                  <div key={page} className="flex items-stretch">
                    {page > 0 && (
                      <button
                        type="button"
                        aria-pressed={breaks.has(page)}
                        aria-label={
                          breaks.has(page)
                            ? `${page}ページと${page + 1}ページの間の区切りを外す`
                            : `${page}ページと${page + 1}ページの間で区切る`
                        }
                        title={breaks.has(page) ? '区切りを外す' : 'ここで区切る'}
                        disabled={locked || submitting}
                        onClick={() => setBreaks((prev) => toggleBreak(prev, page))}
                        className={cn(
                          'mx-0.5 w-3 rounded-sm',
                          breaks.has(page)
                            ? 'bg-red-500 hover:bg-red-400'
                            : 'bg-transparent hover:bg-blue-200 disabled:hover:bg-transparent',
                        )}
                      />
                    )}
                    <PageThumb
                      pages={pdf.pages}
                      page={page}
                      rotation={rotations[page] ?? 0}
                      segmentNo={seg?.no ?? 1}
                      onRotate={(d) => rotate(page, d)}
                      disabled={locked || submitting}
                    />
                  </div>
                );
              })}
            </div>

            <table className="w-full table-fixed border-collapse text-xs">
              <thead>
                <tr className="border-b border-gray-200 bg-gray-50 text-left text-gray-600">
                  <th className="w-14 px-1 py-1 font-medium">区間</th>
                  <th className="w-16 px-1 py-1 font-medium">ページ</th>
                  <th className="px-1 py-1 font-medium">点検（物件・点検種別・対象月）</th>
                  <th className="w-32 px-1 py-1 font-medium">実施日</th>
                  <th className="w-44 px-1 py-1 font-medium">メモ</th>
                  <th className="w-52 px-1 py-1 font-medium">結果</th>
                </tr>
              </thead>
              <tbody>
                {segments.map((seg) => (
                  <SegmentRow
                    key={seg.start}
                    segment={seg}
                    input={inputs[seg.start] ?? EMPTY_INPUT}
                    defaultPerformedOn={defaultPerformedOn}
                    groups={groups}
                    target={targetMap.get((inputs[seg.start] ?? EMPTY_INPUT).targetKey) ?? null}
                    reports={data.reports}
                    errors={touched ? errors[seg.start] : undefined}
                    result={results[seg.start]}
                    disabled={submitting || results[seg.start]?.state === 'ok'}
                    onChange={(patch) => setInput(seg.start, patch)}
                  />
                ))}
              </tbody>
            </table>
          </>
        )}
      </div>
    </Modal>
  );
}

interface PageThumbProps {
  pages: PdfPages;
  page: number;
  rotation: number;
  segmentNo: number;
  onRotate: (delta: number) => void;
  disabled: boolean;
}

function PageThumb({ pages, page, rotation, segmentNo, onRotate, disabled }: PageThumbProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    let cancelled = false;
    pages
      .render(page, rotation, canvas, THUMB_WIDTH, () => cancelled)
      .then(() => {
        if (!cancelled) setFailed(false);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        console.error('Thumbnail render failed:', err);
        setFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, [pages, page, rotation]);

  return (
    <figure
      className={cn('flex w-[132px] flex-col items-center gap-0.5 rounded border-2 p-1', colorOf(segmentNo))}
      data-testid={`bulk-page-${page + 1}`}
    >
      <div className="flex min-h-24 flex-1 items-center justify-center bg-white">
        <canvas ref={canvasRef} aria-label={`${page + 1}ページ目`} className="block max-w-full shadow-sm" />
        {failed && <span className="text-[10px] text-red-600">表示できません</span>}
      </div>
      <figcaption className="flex w-full items-center justify-between text-[11px]">
        <span>
          区間{segmentNo}・p.{page + 1}
          {rotation !== 0 && <span className="ml-0.5 text-gray-500">{rotation}°</span>}
        </span>
        <span className="flex gap-0.5">
          <button
            type="button"
            className="rounded px-1 hover:bg-white/70 disabled:opacity-40"
            aria-label={`${page + 1}ページ目を左に90度回す`}
            title="左に回す"
            disabled={disabled}
            onClick={() => onRotate(-90)}
          >
            ⟲
          </button>
          <button
            type="button"
            className="rounded px-1 hover:bg-white/70 disabled:opacity-40"
            aria-label={`${page + 1}ページ目を右に90度回す`}
            title="右に回す"
            disabled={disabled}
            onClick={() => onRotate(90)}
          >
            ⟳
          </button>
        </span>
      </figcaption>
    </figure>
  );
}

interface SegmentRowProps {
  segment: Segment;
  input: SegmentInput;
  defaultPerformedOn: string;
  groups: [string, BulkTarget[]][];
  target: BulkTarget | null;
  reports: Parameters<typeof existingReport>[0];
  errors: { target?: string; performedOn?: string } | undefined;
  result: SegmentResult | undefined;
  disabled: boolean;
  onChange: (patch: Partial<SegmentInput>) => void;
}

function SegmentRow({
  segment,
  input,
  defaultPerformedOn,
  groups,
  target,
  reports,
  errors,
  result,
  disabled,
  onChange,
}: SegmentRowProps) {
  const performedOn = effectivePerformedOn(input, defaultPerformedOn);
  const month = target ? effectiveTargetMonth(target, performedOn) : null;
  const previous = target ? existingReport(reports, target, performedOn) : null;
  return (
    <tr className="border-b border-gray-100 align-top" data-testid={`bulk-segment-${segment.no}`}>
      <td className="px-1 py-1">
        <span className={cn('inline-block rounded border px-1', colorOf(segment.no))}>区間{segment.no}</span>
      </td>
      <td className="px-1 py-1 text-gray-700">{pageLabel(segment)}</td>
      <td className="px-1 py-1">
        <select
          aria-label={`区間${segment.no}の点検`}
          className={cn(
            'block w-full rounded border border-gray-300 px-1 py-0.5 text-xs',
            errors?.target && 'border-red-500',
          )}
          value={input.targetKey}
          disabled={disabled}
          onChange={(e) => onChange({ targetKey: e.target.value })}
        >
          <option value="">点検を選んでください</option>
          {groups.map(([group, items]) => (
            <optgroup key={group} label={group}>
              {items.map((t) => (
                <option key={t.key} value={t.key}>
                  {t.label}
                </option>
              ))}
            </optgroup>
          ))}
        </select>
        {target && (
          <p className="mt-0.5 text-[11px] text-gray-500">
            対象月: {month ? formatMonth(month) : '（実施日の月）'}
            {previous && <span className="ml-1 text-amber-700">提出済みの版（{previous.file_name}）があります</span>}
          </p>
        )}
        {errors?.target && <p className="mt-0.5 text-[11px] text-red-600">{errors.target}</p>}
      </td>
      <td className="px-1 py-1">
        <input
          type="date"
          aria-label={`区間${segment.no}の実施日`}
          className={cn(
            'block w-full rounded border border-gray-300 px-1 py-0.5 text-xs',
            errors?.performedOn && 'border-red-500',
            !input.performedOn && 'text-gray-500',
          )}
          value={input.performedOn || defaultPerformedOn}
          max="9999-12-31"
          disabled={disabled}
          onChange={(e) => onChange({ performedOn: e.target.value })}
        />
        {errors?.performedOn && <p className="mt-0.5 text-[11px] text-red-600">{errors.performedOn}</p>}
      </td>
      <td className="px-1 py-1">
        <input
          type="text"
          aria-label={`区間${segment.no}のメモ`}
          className="block w-full rounded border border-gray-300 px-1 py-0.5 text-xs"
          value={input.note}
          disabled={disabled}
          onChange={(e) => onChange({ note: e.target.value })}
        />
      </td>
      <td className="px-1 py-1" aria-live="polite">
        {result?.state === 'running' && (
          <span className="flex items-center gap-1 text-gray-600">
            <Spinner size="sm" />
            送信中…
          </span>
        )}
        {result?.state === 'ok' && <span className="break-all text-green-700">提出しました（{result.fileName}）</span>}
        {result?.state === 'error' && <span className="break-all text-red-600">失敗: {result.message}</span>}
      </td>
    </tr>
  );
}
