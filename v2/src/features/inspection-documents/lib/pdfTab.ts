/*
 * 報告書を新しいタブで開く（修正依頼1027(2)）。
 * 署名付き URL をそのまま開くと、ブラウザの PDF ビューアはタブの名前に URL の末尾（Storage のキー＝ランダムな英数字.pdf）を出し、
 * 利用者には文字化けに見えていた（Storage のキーは ASCII にしてあり、日本語の表示名は DB にしか無い。
 * 署名付き URL は download を付けないと Content-Disposition が付かず、付けると保存になってしまう）。
 * そこで、開いた空のタブ（同じオリジン）に表示名をタイトルとして入れ、PDF 本体（blob）を全面の iframe で出す。
 * PDF ビューアの見出しは文書のタイトル（/Title）が無いと URL の末尾を出すので、出す写しのタイトルも表示名にする（保存されている本体は変えない）。
 */

/** PDF の文書のタイトルを title にした写しを返す（pdf-lib は開くときだけ読み込む）。読めない PDF（暗号化など）はそのまま返す */
export async function withPdfTitle(blob: Blob, title: string): Promise<Blob> {
  try {
    const { PDFDocument } = await import('pdf-lib');
    const doc = await PDFDocument.load(new Uint8Array(await blob.arrayBuffer()), { updateMetadata: false });
    doc.setTitle(title, { showInWindowTitleBar: true });
    const bytes = await doc.save();
    return new Blob([bytes as Uint8Array<ArrayBuffer>], { type: 'application/pdf' });
  } catch (err) {
    console.warn('PDF title could not be set:', err);
    return blob;
  }
}

/** 空のタブ tab に、title をタブの名前にして PDF を出す。blob の URL は開いた元の画面が閉じるまで有効 */
export function showPdfInTab(tab: Window, blob: Blob, title: string): void {
  const pdf = blob.type === 'application/pdf' ? blob : new Blob([blob], { type: 'application/pdf' });
  const url = URL.createObjectURL(pdf);
  const doc = tab.document;
  doc.title = title;
  doc.body.style.margin = '0';
  const frame = doc.createElement('iframe');
  frame.src = url;
  frame.title = title;
  frame.style.cssText = 'position:fixed;inset:0;width:100%;height:100%;border:0';
  doc.body.replaceChildren(frame);
}
