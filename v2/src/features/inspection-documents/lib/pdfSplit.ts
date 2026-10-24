import type { PDFDocument } from 'pdf-lib';

/*
 * 報告書一括アップロードの切り出し（pdf-lib）。copyPages は元のページの回転（/Rotate）を引き継ぐので、
 * 画面で足した回転だけを上乗せする（元の回転をもう一度足すと二重に回る）。
 * pdf-lib は送信するときにだけ読み込む（ほかの画面の読み込みを重くしない）
 */

export interface PageRange {
  /** 先頭ページ（0 始まり） */
  start: number;
  /** 末尾ページ（0 始まり、含む） */
  end: number;
}

/** 元の PDF を読む。暗号化された PDF などは読めないので、呼び出し側で日本語の理由にして出す */
export async function loadSourcePdf(bytes: Uint8Array): Promise<PDFDocument> {
  const { PDFDocument } = await import('pdf-lib');
  return PDFDocument.load(bytes);
}

/** 1区間を新しい PDF として切り出す。userRotations はページ番号（0 始まり）→ 画面で足した回転（90 の倍数） */
export async function extractRange(
  source: PDFDocument,
  range: PageRange,
  userRotations: Record<number, number>,
): Promise<Uint8Array> {
  const { PDFDocument, degrees } = await import('pdf-lib');
  const out = await PDFDocument.create();
  const indices = Array.from({ length: range.end - range.start + 1 }, (_, i) => range.start + i);
  const pages = await out.copyPages(source, indices);
  pages.forEach((page, i) => {
    const added = userRotations[range.start + i] ?? 0;
    if (added % 360 !== 0) {
      page.setRotation(degrees((((page.getRotation().angle + added) % 360) + 360) % 360));
    }
    out.addPage(page);
  });
  return out.save();
}
