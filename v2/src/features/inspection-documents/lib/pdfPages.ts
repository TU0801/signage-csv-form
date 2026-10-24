/*
 * 報告書一括アップロードのページのサムネイル描画（pdfjs-dist）。
 * worker は Vite の ?url で同じ配布物に含める（CDN から取らない）。
 * pdfjs は初回に開いたときだけ読み込む（一括アップロードを開かない画面の読み込みを重くしない）。
 * legacy ビルドを使う: 通常ビルドは Map.prototype.getOrInsertComputed・Math.sumPrecise など新しい API を
 * 代替なしで呼び、それらをまだ持たない少し前の版のブラウザではページの描画が失敗する。
 * legacy ビルドはこれらの代替（core-js）を同梱している。
 */
import type { PDFDocumentProxy } from 'pdfjs-dist';

type Pdfjs = typeof import('pdfjs-dist/legacy/build/pdf.mjs');
let pdfjsPromise: Promise<Pdfjs> | null = null;

async function loadPdfjs() {
  if (!pdfjsPromise) {
    pdfjsPromise = Promise.all([
      import('pdfjs-dist/legacy/build/pdf.mjs'),
      import('pdfjs-dist/legacy/build/pdf.worker.min.mjs?url'),
    ]).then(
      ([pdfjs, worker]) => {
        pdfjs.GlobalWorkerOptions.workerSrc = worker.default;
        return pdfjs;
      },
    );
  }
  return pdfjsPromise;
}

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
