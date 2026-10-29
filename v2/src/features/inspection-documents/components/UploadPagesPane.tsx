import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/Button';
import { cn } from '@/lib/utils';
import { formatBytes } from '../lib/documents';
import type { PdfPages } from '../lib/pdfPages';
import type { UploadRow, UploadSource } from '../lib/uploadRows';
import { FilePreview } from './FilePreview';

/*
 * ファイルのアップロード（修正依頼1029(1)）の左側: 追加したファイルのプレビュー。
 * PDF はページを並べ、ページの間の縦の帯をクリックして区間を切る／外す、ページの回転、ページの削除（空白ページなど）。
 * 画像・動画はそのまま、Excel・Word・PowerPoint はファイル名だけ。前の『報告書一括アップロード』のプレビューを流用した。
 */

/** サムネイルの幅の既定（入れ物の幅が測れないとき） */
const THUMB_WIDTH = 240;
/** 1行に並べるページの数の選択肢と既定（修正依頼1026 K5: 拡大率100%で文字が読めるよう既定は2枚） */
export const PER_ROW_OPTIONS = [1, 2, 3, 4] as const;
export type PerRow = (typeof PER_ROW_OPTIONS)[number];
export const DEFAULT_PER_ROW: PerRow = 2;
/** ページ1枚ぶんの幅のうちサムネイル以外（区切りの帯 20px・枠と余白 12px） */
const THUMB_CHROME = 32;
/** 描く解像度の上限（px）。大きく並べても 27 ページの PDF でメモリを使い切らない */
const MAX_RENDER_WIDTH = 900;
const thumbScale = () => Math.min(2, Math.max(1, typeof window === 'undefined' ? 1 : window.devicePixelRatio || 1));

/** 入れ物の幅から、1行に perRow 枚並べたときのサムネイルの幅 */
export function thumbWidthFor(containerWidth: number, perRow: number): number {
  if (containerWidth <= 0) return THUMB_WIDTH;
  // 入れ物の左右の余白（p-2）とスクロールバーのぶんを引く
  return Math.max(120, Math.floor((containerWidth - 16 - 4) / perRow) - THUMB_CHROME);
}

/** 区間の見分けに使う色（行の番号の順にくり返す） */
const SEGMENT_COLORS = [
  'border-blue-400 bg-blue-50 text-blue-800',
  'border-emerald-400 bg-emerald-50 text-emerald-800',
  'border-amber-400 bg-amber-50 text-amber-800',
  'border-fuchsia-400 bg-fuchsia-50 text-fuchsia-800',
  'border-cyan-400 bg-cyan-50 text-cyan-800',
];
export const colorOf = (no: number) => SEGMENT_COLORS[(no - 1) % SEGMENT_COLORS.length];

export interface UploadPagesPaneProps {
  sources: UploadSource[];
  /** PDF の描画（ファイルの id → pdfjs の文書） */
  docs: Record<string, PdfPages>;
  rotations: Record<string, Record<number, number>>;
  rows: UploadRow[];
  /** 区切り・回転・削除を変えられないファイル（登録済みの区間があるもの） */
  lockedSources: ReadonlySet<string>;
  /** 表で選んでいる行（プレビューで強調し、そこまでスクロールする） */
  activeRowKey: string | null;
  /** 空白ページを探している最中のファイル */
  scanning: ReadonlySet<string>;
  /** 空白ページを探した結果の文言（ファイルの id → 「空白ページはありませんでした」など） */
  blankNotes?: Record<string, string>;
  disabled: boolean;
  onToggleBreak: (sourceId: string, before: number) => void;
  onRotate: (sourceId: string, page: number, delta: number) => void;
  onToggleRemoved: (sourceId: string, page: number) => void;
  onFindBlank: (sourceId: string) => void;
  onRemoveSource: (sourceId: string) => void;
}

export function UploadPagesPane(props: UploadPagesPaneProps) {
  const { sources, rows } = props;
  const [perRow, setPerRow] = useState<PerRow>(DEFAULT_PER_ROW);
  const boxRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  useLayoutEffect(() => {
    const el = boxRef.current;
    if (!el) return;
    setWidth(el.clientWidth);
    if (typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(() => setWidth(el.clientWidth));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  // ファイルごとの枠（枠線と余白 12px）のぶんを引く
  const thumbWidth = thumbWidthFor(width - 12, perRow);

  // 表で行を選んだら、その区間の先頭ページ（PDF 以外はファイル）までスクロールする
  const active = rows.find((r) => r.key === props.activeRowKey) ?? null;
  useEffect(() => {
    if (!active) return;
    const id = active.segment ? `upload-page-${active.sourceId}-${active.segment.start}` : `upload-source-${active.sourceId}`;
    document.getElementById(id)?.scrollIntoView?.({ block: 'nearest', behavior: 'smooth' });
  }, [active]);

  return (
    <section aria-label="プレビュー" className="flex min-h-0 flex-1 flex-col rounded border-2 border-emerald-500">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-emerald-200 bg-emerald-50/60 px-2 py-0.5 text-xs text-gray-600">
        <span className="font-semibold text-gray-700">ページのプレビュー</span>
        <span className="text-[11px] text-gray-500">ページの間の縦の帯をクリックすると区間を切る／外す。要らないページは「削除」。</span>
        <div className="ml-auto flex items-center gap-1" role="group" aria-label="1行に並べる枚数">
          <span>1行に</span>
          {PER_ROW_OPTIONS.map((n) => (
            <button
              key={n}
              type="button"
              aria-pressed={perRow === n}
              onClick={() => setPerRow(n)}
              className={cn(
                'h-5 rounded border px-1.5 text-[11px]',
                perRow === n ? 'border-blue-500 bg-blue-50 font-medium text-blue-800' : 'border-gray-300 bg-white hover:bg-gray-50',
              )}
            >
              {n}枚
            </button>
          ))}
        </div>
      </div>
      <div ref={boxRef} className="min-h-[12rem] flex-1 overflow-y-auto bg-gray-50 p-2" data-testid="upload-pages">
        {sources.length === 0 && <p className="py-10 text-center text-xs text-gray-400">ファイルを追加すると、ここにプレビューが出ます</p>}
        {sources.map((s) => (
          <SourceBlock key={s.id} {...props} source={s} thumbWidth={thumbWidth} />
        ))}
      </div>
    </section>
  );
}

function SourceBlock({
  source,
  docs,
  rotations,
  rows,
  lockedSources,
  activeRowKey,
  scanning,
  blankNotes,
  disabled,
  thumbWidth,
  onToggleBreak,
  onRotate,
  onToggleRemoved,
  onFindBlank,
  onRemoveSource,
}: UploadPagesPaneProps & { source: UploadSource; thumbWidth: number }) {
  const locked = lockedSources.has(source.id);
  const doc = docs[source.id];
  const myRows = rows.filter((r) => r.sourceId === source.id);
  const rowOfPage = (page: number) => myRows.find((r) => r.segment && page >= r.segment.start && page <= r.segment.end);
  return (
    <div id={`upload-source-${source.id}`} className="mb-2 rounded border border-gray-200 bg-white" data-testid="upload-source">
      <div className="flex flex-wrap items-center gap-2 border-b border-gray-100 px-1.5 py-0.5 text-xs">
        <span className="min-w-[8rem] flex-1 truncate font-medium text-gray-800" title={source.file.name}>
          {source.file.name}
        </span>
        <span className="text-gray-500">
          {formatBytes(source.file.size)}
          {source.kind === 'pdf' && `・${source.pageCount}ページ`}
          {source.removed.size > 0 && `（${source.removed.size}ページ削除）`}
        </span>
        {source.kind === 'pdf' && (
          <Button
            variant="ghost"
            size="sm"
            className="h-5 px-1 text-[11px]"
            disabled={disabled || locked || scanning.has(source.id) || !doc}
            onClick={() => onFindBlank(source.id)}
            title="白紙のページを探して削除の印を付けます（戻せます）"
          >
            {scanning.has(source.id) ? '空白ページを探しています…' : '空白ページを削除'}
          </Button>
        )}

        <Button
          variant="ghost"
          size="sm"
          className="h-5 px-1 text-[11px] text-red-700"
          disabled={disabled || locked}
          aria-label={`${source.file.name} を外す`}
          onClick={() => onRemoveSource(source.id)}
        >
          外す
        </Button>
      </div>
      {source.kind === 'pdf' && blankNotes?.[source.id] && !scanning.has(source.id) && (
        <p role="status" className="px-1.5 text-[11px] text-blue-800">
          {blankNotes[source.id]}
        </p>
      )}
      {locked && <p className="px-1.5 text-[11px] text-gray-500">登録済みの区間があるため、区切り・回転・削除は変えられません。</p>}
      {source.kind !== 'pdf' ? (
        <div className={cn('max-h-80 overflow-hidden p-1', myRows[0]?.key === activeRowKey && 'ring-2 ring-blue-400')}>
          <FilePreview file={source.file} />
        </div>
      ) : !doc ? (
        <p className="p-2 text-xs text-gray-500">PDF を開いています…</p>
      ) : (
        <div className="flex flex-wrap items-stretch gap-y-2 p-1">
          {Array.from({ length: source.pageCount }, (_, page) => {
            const row = rowOfPage(page);
            const isBreak = source.breaks.has(page);
            return (
              <div key={page} className="flex items-stretch">
                {/* 1ページ目にも帯の幅を取って、1行の枚数どおりに並ぶようにする（1ページ目の帯は押せない） */}
                {page > 0 ? (
                  <button
                    type="button"
                    aria-pressed={isBreak}
                    aria-label={
                      isBreak
                        ? `${source.file.name} の${page}ページと${page + 1}ページの間の区切りを外す`
                        : `${source.file.name} の${page}ページと${page + 1}ページの間で区切る`
                    }
                    title={isBreak ? '区切りを外す' : 'ここで区切る'}
                    disabled={locked || disabled}
                    onClick={() => onToggleBreak(source.id, page)}
                    className={cn(
                      'mx-0.5 w-4 rounded-sm',
                      isBreak ? 'bg-red-500 hover:bg-red-400' : 'bg-transparent hover:bg-blue-200 disabled:hover:bg-transparent',
                    )}
                  />
                ) : (
                  <span className="mx-0.5 w-4" aria-hidden />
                )}
                <PageThumb
                  id={`upload-page-${source.id}-${page}`}
                  pages={doc}
                  page={page}
                  width={thumbWidth}
                  rotation={rotations[source.id]?.[page] ?? 0}
                  rowNo={row?.no ?? 1}
                  active={!!row && row.key === activeRowKey}
                  removed={source.removed.has(page)}
                  onRotate={(d) => onRotate(source.id, page, d)}
                  onToggleRemoved={() => onToggleRemoved(source.id, page)}
                  disabled={locked || disabled}
                />
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

interface PageThumbProps {
  id: string;
  pages: PdfPages;
  page: number;
  /** 画面での幅（px。1行の枚数と入れ物の幅から決める） */
  width: number;
  rotation: number;
  rowNo: number;
  active: boolean;
  removed: boolean;
  onRotate: (delta: number) => void;
  onToggleRemoved: () => void;
  disabled: boolean;
}

function PageThumb({ id, pages, page, width, rotation, rowNo, active, removed, onRotate, onToggleRemoved, disabled }: PageThumbProps) {
  const figureRef = useRef<HTMLElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [failed, setFailed] = useState(false);
  // 見える近くまでスクロールしてから描く（大きく並べたときに全ページを一度に描いてメモリを使い切らない）
  const [near, setNear] = useState(typeof IntersectionObserver === 'undefined');
  useEffect(() => {
    const el = figureRef.current;
    if (near || !el || typeof IntersectionObserver === 'undefined') return;
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) setNear(true);
      },
      { rootMargin: '400px' },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [near]);
  // 描く幅は 50px 単位にそろえる（入れ物の幅が少し変わるたびに描き直さない）
  const renderWidth = Math.min(MAX_RENDER_WIDTH, Math.ceil((width * thumbScale()) / 50) * 50);
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !near) return;
    let cancelled = false;
    pages
      .render(page, rotation, canvas, renderWidth, () => cancelled)
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
  }, [pages, page, rotation, renderWidth, near]);

  return (
    <figure
      ref={figureRef}
      id={id}
      className={cn(
        'relative flex flex-col items-center gap-0.5 rounded border-2 p-1',
        colorOf(rowNo),
        active && 'ring-2 ring-blue-500 ring-offset-1',
      )}
      style={{ width: width + 12 }}
      data-testid={id}
    >
      <div className={cn('flex min-h-40 flex-1 items-center justify-center bg-white', removed && 'opacity-30')}>
        <canvas ref={canvasRef} aria-label={`${page + 1}ページ目`} className="block h-auto max-w-full shadow-sm" style={{ width }} />
        {failed && <span className="text-[10px] text-red-600">表示できません</span>}
      </div>
      {removed && (
        <span className="pointer-events-none absolute inset-x-0 top-1/3 text-center text-sm font-bold text-red-600">削除（送りません）</span>
      )}
      <figcaption className="flex w-full items-center justify-between text-[11px]">
        <span>
          行{rowNo}・p.{page + 1}
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
          <button
            type="button"
            className={cn('rounded px-1 disabled:opacity-40', removed ? 'text-blue-700 hover:bg-white/70' : 'text-red-700 hover:bg-white/70')}
            aria-pressed={removed}
            aria-label={removed ? `${page + 1}ページ目の削除を戻す` : `${page + 1}ページ目を削除`}
            disabled={disabled}
            onClick={onToggleRemoved}
          >
            {removed ? '戻す' : '削除'}
          </button>
        </span>
      </figcaption>
    </figure>
  );
}
