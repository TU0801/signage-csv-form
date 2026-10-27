import { describe, expect, it } from 'vitest';
import { PDFDocument } from 'pdf-lib';
import { withPdfTitle } from '../lib/pdfTab';

describe('withPdfTitle（修正依頼1027(2) 『開く』の名前）', () => {
  it('PDF の文書のタイトルを報告書のファイル名にする（PDF ビューアの見出しに出る）。読めない PDF はそのまま返す', async () => {
    const src = await PDFDocument.create();
    src.addPage([100, 100]);
    const blob = new Blob([(await src.save()) as Uint8Array<ArrayBuffer>], { type: 'application/pdf' });
    const titled = await withPdfTitle(blob, '20261026_テスト第一ビル_消防設備点検.pdf');
    const out = await PDFDocument.load(new Uint8Array(await titled.arrayBuffer()));
    expect(out.getTitle()).toBe('20261026_テスト第一ビル_消防設備点検.pdf');
    expect(titled.type).toBe('application/pdf');

    const broken = new Blob(['not a pdf'], { type: 'application/pdf' });
    expect(await withPdfTitle(broken, 'a.pdf')).toBe(broken);
  });
});
