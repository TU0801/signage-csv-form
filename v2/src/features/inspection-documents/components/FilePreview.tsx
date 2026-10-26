import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Spinner } from '@/components/ui/Spinner';
import { openPdfPages, type PdfPages } from '../lib/pdfPages';
import { propertyFileMime } from '../lib/propertyFiles';

/*
 * 選んだファイルのプレビュー（その他ファイルアップロード。修正依頼1026 J3。DocFlow と同じく左にプレビュー、右に入力欄）。
 * PDF は1ページ目から縦に並べ（多いときは先頭の数ページ）、画像はそのまま、Excel・Word・PowerPoint はファイル名だけ。
 */

/** 描くページの上限（大きなスキャン PDF で描画を待たせない） */
const MAX_PREVIEW_PAGES = 5;
/** 描く解像度の上限（px） */
const MAX_RENDER_WIDTH = 900;
const scale = () => Math.min(2, Math.max(1, typeof window === 'undefined' ? 1 : window.devicePixelRatio || 1));

type Kind = 'pdf' | 'image' | 'other';

function kindOf(file: File): Kind {
  const mime = propertyFileMime(file.name) ?? file.type;
  if (mime === 'application/pdf') return 'pdf';
  if (/^image\/(jpeg|png)$/.test(mime)) return 'image';
  return 'other';
}

export function FilePreview({ file }: { file: File | null }) {
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

  const kind = file ? kindOf(file) : null;
  return (
    <div
      ref={boxRef}
      className="flex max-h-[65vh] min-h-[16rem] flex-col items-center gap-2 overflow-y-auto rounded border border-gray-200 bg-gray-50 p-2"
      data-testid="file-preview"
    >
      {!file && <p className="m-auto text-xs text-gray-400">ファイルを追加すると、ここにプレビューが出ます</p>}
      {file && kind === 'pdf' && <PdfPreview key={`${file.name}-${file.size}-${file.lastModified}`} file={file} width={width} />}
      {file && kind === 'image' && <ImagePreview file={file} />}
      {file && kind === 'other' && (
        <div className="m-auto text-center text-xs text-gray-600">
          <p className="break-all font-medium">{file.name}</p>
          <p className="mt-1 text-gray-400">この形式はプレビューできません（ファイル名のみ）</p>
        </div>
      )}
    </div>
  );
}

function ImagePreview({ file }: { file: File }) {
  const [url, setUrl] = useState<string | null>(null);
  // URL は作った effect の片付けで外す（ファイルを替えた・閉じたときにメモリを残さない）
  useEffect(() => {
    if (typeof URL.createObjectURL !== 'function') return;
    let cancelled = false;
    let u: string | null = null;
    void Promise.resolve().then(() => {
      if (cancelled) return;
      u = URL.createObjectURL(file);
      setUrl(u);
    });
    return () => {
      cancelled = true;
      if (u) URL.revokeObjectURL(u);
    };
  }, [file]);
  return url ? <img src={url} alt={file.name} className="max-w-full rounded shadow-sm" /> : null;
}

function PdfPreview({ file, width }: { file: File; width: number }) {
  const [pages, setPages] = useState<PdfPages | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let cancelled = false;
    let opened: PdfPages | null = null;
    void (async () => {
      try {
        const bytes = new Uint8Array(await file.arrayBuffer());
        opened = await openPdfPages(bytes);
        if (cancelled) opened.destroy();
        else setPages(opened);
      } catch (err) {
        console.error('Preview failed:', err);
        if (!cancelled) setFailed(true);
      }
    })();
    return () => {
      cancelled = true;
      opened?.destroy();
    };
  }, [file]);

  if (failed) return <p className="m-auto text-xs text-red-600">PDF を表示できませんでした</p>;
  if (!pages)
    return (
      <span className="m-auto flex items-center gap-1 text-xs text-gray-500" role="status">
        <Spinner size="sm" />
        プレビューを準備しています…
      </span>
    );
  const count = Math.min(pages.pageCount, MAX_PREVIEW_PAGES);
  const pageWidth = Math.max(160, width - 20);
  return (
    <>
      {Array.from({ length: count }, (_, i) => (
        <PdfPageCanvas key={i} pages={pages} index={i} width={pageWidth} />
      ))}
      {pages.pageCount > count && (
        <p className="text-[11px] text-gray-500">ほか {pages.pageCount - count} ページ（先頭の {count} ページを表示）</p>
      )}
    </>
  );
}

function PdfPageCanvas({ pages, index, width }: { pages: PdfPages; index: number; width: number }) {
  const ref = useRef<HTMLCanvasElement>(null);
  // 描く幅は 50px 単位にそろえる（入れ物の幅が少し変わるたびに描き直さない）
  const renderWidth = Math.min(MAX_RENDER_WIDTH, Math.ceil((width * scale()) / 50) * 50);
  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    let cancelled = false;
    pages.render(index, 0, canvas, renderWidth, () => cancelled).catch((err: unknown) => {
      if (!cancelled) console.error('Preview page render failed:', err);
    });
    return () => {
      cancelled = true;
    };
  }, [pages, index, renderWidth]);
  return (
    <canvas
      ref={ref}
      aria-label={`${index + 1}ページ目`}
      className="block h-auto max-w-full bg-white shadow-sm"
      style={{ width }}
    />
  );
}
