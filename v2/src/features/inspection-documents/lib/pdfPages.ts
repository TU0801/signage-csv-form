/*
 * 報告書一括アップロードのページのサムネイル描画（pdfjs-dist）。
 * pdfjs の読み込み（legacy ビルド・同梱の worker）は貼紙の PDF 変換と共用（lib/pdfjs.ts）。
 */
import type { PDFDocumentProxy } from 'pdfjs-dist';
import { loadPdfjs } from '@/lib/pdfjs';

export interface PdfPages {
  pageCount: number;
  /**
   * ページを canvas に描く。PDF のページ自体の回転（/Rotate）に画面での回転を足して描く
   * （画面の回転だけを渡すと /Rotate が上書きされて上下が逆に出る）。幅は回転後の幅
   */
  render: (
    index: number,
    userRotation: number,
    canvas: HTMLCanvasElement,
    width: number,
    skip?: () => boolean,
  ) => Promise<void>;
  destroy: () => void;
}

/** PDF を開く。bytes は worker へ渡されて使えなくなるので、呼び出し側は写しを渡す */
export async function openPdfPages(bytes: Uint8Array): Promise<PdfPages> {
  const pdfjs = await loadPdfjs();
  const task = pdfjs.getDocument({ data: bytes });
  const doc: PDFDocumentProxy = await task.promise;
  // 描画は1枚ずつ順に行う（大きなスキャン PDF を一度に描いてメモリを使い切らない・同じ canvas への同時描画を避ける）
  let chain: Promise<void> = Promise.resolve();
  const renderOne = async (
    index: number,
    userRotation: number,
    canvas: HTMLCanvasElement,
    width: number,
    skip?: () => boolean,
  ) => {
    // 順番待ちの間に回転が変わった・閉じたものは描かない
    if (skip?.()) return;
    const page = await doc.getPage(index + 1);
    const rotation = (((page.rotate + userRotation) % 360) + 360) % 360;
    const base = page.getViewport({ scale: 1, rotation });
    const viewport = page.getViewport({ scale: width / base.width, rotation });
    canvas.width = Math.floor(viewport.width);
    canvas.height = Math.floor(viewport.height);
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    await page.render({ canvas, canvasContext: ctx, viewport }).promise;
  };
  return {
    pageCount: doc.numPages,
    render: (...args) => {
      const run = chain.then(() => renderOne(...args));
      chain = run.catch(() => undefined);
      return run;
    },
    destroy: () => {
      void task.destroy();
    },
  };
}
