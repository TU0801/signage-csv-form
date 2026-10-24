import { POSTER_PNG_SIZE } from './constants';
import { validateImageFile } from './storage';

/** PDF か（MIME が空のときもあるので拡張子も見る） */
export function isPdfFile(file: Pick<File, 'type' | 'name'>): boolean {
  return file.type === 'application/pdf' || /\.pdf$/i.test(file.name);
}

/** 縦横比を保って枠に収める（contain）ときの倍率と描画位置。余白は左右か上下に均等に付く */
export function containFit(
  srcWidth: number,
  srcHeight: number,
  dstWidth: number,
  dstHeight: number,
): { x: number; y: number; width: number; height: number; scale: number } {
  const scale = Math.min(dstWidth / srcWidth, dstHeight / srcHeight);
  const width = srcWidth * scale;
  const height = srcHeight * scale;
  return { x: (dstWidth - width) / 2, y: (dstHeight - height) / 2, width, height, scale };
}

/** pdfjs-dist を読み込む（初めて PDF を選んだときだけ。worker は Vite の ?url でバンドルしたものを使い、CDN は使わない） */
async function loadPdfjs() {
  const [pdfjs, worker] = await Promise.all([
    import('pdfjs-dist'),
    import('pdfjs-dist/build/pdf.worker.min.mjs?url'),
  ]);
  if (!pdfjs.GlobalWorkerOptions.workerSrc) pdfjs.GlobalWorkerOptions.workerSrc = worker.default;
  return pdfjs;
}

function canvasToPng(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('PDF を画像に変換できませんでした'))), 'image/png');
  });
}

/**
 * PDF の1ページ目を POSTER_PNG_SIZE の PNG にする（白背景・縦横比を保って全体を収める＝contain）。
 * ページの /Rotate は getViewport が反映する。pageCount は PDF の全ページ数
 */
export async function pdfFirstPageToPng(file: File): Promise<{ file: File; pageCount: number }> {
  const pdfjs = await loadPdfjs();
  const data = new Uint8Array(await file.arrayBuffer());
  const task = pdfjs.getDocument({ data });
  const doc = await task.promise;
  try {
    const page = await doc.getPage(1);
    const { width: W, height: H } = POSTER_PNG_SIZE;
    const base = page.getViewport({ scale: 1 });
    const fit = containFit(base.width, base.height, W, H);
    const viewport = page.getViewport({ scale: fit.scale });

    // ページを収まる大きさで描いてから、白で塗った枠の真ん中に置く
    const pageCanvas = document.createElement('canvas');
    pageCanvas.width = Math.max(1, Math.round(viewport.width));
    pageCanvas.height = Math.max(1, Math.round(viewport.height));
    await page.render({ canvas: pageCanvas, viewport }).promise;

    const out = document.createElement('canvas');
    out.width = W;
    out.height = H;
    const ctx = out.getContext('2d');
    if (!ctx) throw new Error('canvas 2d context is not available');
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, W, H);
    ctx.drawImage(pageCanvas, Math.round((W - pageCanvas.width) / 2), Math.round((H - pageCanvas.height) / 2));

    const blob = await canvasToPng(out);
    const name = `${file.name.replace(/\.pdf$/i, '') || 'poster'}.png`;
    return { file: new File([blob], name, { type: 'image/png' }), pageCount: doc.numPages };
  } finally {
    void task.destroy();
  }
}

/**
 * 貼紙画像として使えるファイルにする。PDF は1ページ目を PNG に変換してから、形式（PNG/JPEG）と大きさ（5MB 以下）を確かめる。
 * 複数ページの PDF は notice に「1ページ目を使用」の知らせを返す。だめなら Error を投げる（メッセージは画面にそのまま出す）
 */
export async function preparePosterImage(file: File): Promise<{ file: File; notice: string | null }> {
  if (!isPdfFile(file)) {
    validateImageFile(file);
    return { file, notice: null };
  }
  let converted: { file: File; pageCount: number };
  try {
    converted = await pdfFirstPageToPng(file);
  } catch (e) {
    console.error('PDF conversion failed:', e);
    throw new Error('PDF を画像に変換できませんでした（壊れているか、パスワード付きの PDF の可能性があります）', { cause: e });
  }
  validateImageFile(converted.file);
  return {
    file: converted.file,
    notice: converted.pageCount > 1 ? `PDF は${converted.pageCount}ページあります。1ページ目を使用します` : null,
  };
}
