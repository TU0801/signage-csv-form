/*
 * pdfjs-dist の読み込み（貼紙の PDF→PNG 変換と、報告書一括アップロードのページ描画で共用）。
 * 初めて PDF を扱うときだけ読み込む（PDF を使わない画面の読み込みを重くしない）。
 * worker は Vite の ?url で同じ配布物に含める（CDN から取らない）。設定は一度だけ。
 * legacy ビルドを使う: 通常ビルドは Map.prototype.getOrInsertComputed・Math.sumPrecise など新しい API を
 * 代替なしで呼び、それらをまだ持たない少し前の版のブラウザでは PDF を開けない。
 * legacy ビルドはこれらの代替（core-js）を同梱している。
 */
import jbig2WasmUrl from 'pdfjs-dist/wasm/jbig2.wasm?url';
import openjpegWasmUrl from 'pdfjs-dist/wasm/openjpeg.wasm?url';

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

/**
 * 画像の復号に使う wasm（pdfjs-dist/wasm）。白黒スキャナの PDF（CCITTFax・JBIG2）は jbig2.wasm、JPEG2000 は openjpeg.wasm で復号する。
 * pdfjs は wasm を wasmUrl のフォルダから取るが、Vite はファイルごとにハッシュ付きの名前で置くので、名前 → URL の表で渡す。
 * これが無いとその画像だけ復号できず、ページが白く描かれる（修正依頼1027(4): 複合機 Apeos の複数ページのカメラ報告書）
 */
const WASM_URLS: Record<string, string> = {
  'jbig2.wasm': jbig2WasmUrl,
  'openjpeg.wasm': openjpegWasmUrl,
};

/** pdfjs が worker から頼む wasm を、上の表の URL から取ってくる（getDocument の BinaryDataFactory） */
export class BundledBinaryDataFactory {
  async fetch({ kind, filename }: { kind: string; filename: string }): Promise<Uint8Array> {
    const url = kind === 'wasmUrl' ? WASM_URLS[filename] : undefined;
    if (!url) throw new Error(`${filename} は同梱していません`);
    const res = await fetch(url);
    if (!res.ok) throw new Error(`${filename} を読み込めませんでした（${res.status}）`);
    return new Uint8Array(await res.arrayBuffer());
  }
}

/** getDocument に渡す引数（データと wasm の取り方）。PDF を開くところはすべてこれを使う */
export function pdfDocumentParams(data: Uint8Array) {
  return { data, BinaryDataFactory: BundledBinaryDataFactory };
}
