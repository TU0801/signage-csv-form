/*
 * pdfjs-dist の読み込み（貼紙の PDF→PNG 変換と、報告書一括アップロードのページ描画で共用）。
 * 初めて PDF を扱うときだけ読み込む（PDF を使わない画面の読み込みを重くしない）。
 * worker は Vite の ?url で同じ配布物に含める（CDN から取らない）。設定は一度だけ。
 * legacy ビルドを使う: 通常ビルドは Map.prototype.getOrInsertComputed・Math.sumPrecise など新しい API を
 * 代替なしで呼び、それらをまだ持たない少し前の版のブラウザでは PDF を開けない。
 * legacy ビルドはこれらの代替（core-js）を同梱している。
 */
export type Pdfjs = typeof import('pdfjs-dist/legacy/build/pdf.mjs');

let pdfjsPromise: Promise<Pdfjs> | null = null;

export function loadPdfjs(): Promise<Pdfjs> {
  if (!pdfjsPromise) {
    pdfjsPromise = Promise.all([
      import('pdfjs-dist/legacy/build/pdf.mjs'),
      import('pdfjs-dist/legacy/build/pdf.worker.min.mjs?url'),
    ]).then(([pdfjs, worker]) => {
      pdfjs.GlobalWorkerOptions.workerSrc = worker.default;
      return pdfjs;
    });
    // 読み込みに失敗したら（ネットワーク切れなど）、次に PDF を選んだときに読み直す
    pdfjsPromise.catch(() => {
      pdfjsPromise = null;
    });
  }
  return pdfjsPromise;
}
