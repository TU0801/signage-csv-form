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
  return extractPages(
    source,
    Array.from({ length: range.end - range.start + 1 }, (_, i) => range.start + i),
    userRotations,
  );
}

/** 指定したページ（0 始まり。削除したページを除いたもの。修正依頼1029(1)）を新しい PDF として切り出す */
export async function extractPages(
  source: PDFDocument,
  indices: number[],
  userRotations: Record<number, number>,
): Promise<Uint8Array> {
  const { PDFDocument, degrees } = await import('pdf-lib');
  // 作成日時・更新日時・Producer を書かない（既定では今の時刻が入り、同じ区間でも切り出すたびに中身＝SHA-256 が変わる。
  // 提出済みの報告書と同じ内容かを content_hash で見比べるので、同じ区間は同じバイト列にする）
  const out = await PDFDocument.create({ updateMetadata: false });
  const pages = await out.copyPages(source, indices);
  pages.forEach((page, i) => {
    const added = userRotations[indices[i] ?? -1] ?? 0;
    if (added % 360 !== 0) {
      page.setRotation(degrees((((page.getRotation().angle + added) % 360) + 360) % 360));
    }
    out.addPage(page);
  });
  return out.save();
}
