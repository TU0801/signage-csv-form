import { describe, expect, it } from 'vitest';
import { PDFDocument, degrees } from 'pdf-lib';
import { extractRange, loadSourcePdf } from '../lib/pdfSplit';

describe('extractRange', () => {
  it('区間のページだけを切り出し、元の回転（/Rotate）に画面で足した回転を上乗せして保存する', async () => {
    const src = await PDFDocument.create();
    for (let i = 0; i < 5; i++) src.addPage([100 + i, 200]);
    src.getPage(2).setRotation(degrees(90));
    const source = await loadSourcePdf(await src.save());

    const out = await PDFDocument.load(await extractRange(source, { start: 1, end: 3 }, { 2: 90, 3: 270, 0: 90 }));
    expect(out.getPageCount()).toBe(3);
    // 1ページ目（元の2ページ目）の幅で、どのページを切り出したかを見る
    expect(out.getPages().map((p) => p.getWidth())).toEqual([101, 102, 103]);
    expect(out.getPages().map((p) => p.getRotation().angle)).toEqual([0, 180, 270]);
  });
});
