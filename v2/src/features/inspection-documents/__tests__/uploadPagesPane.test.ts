import { describe, expect, it } from 'vitest';
import { fitPerRow, thumbWidthFor } from '../components/UploadPagesPane';

describe('ページのプレビューの1行の枚数（修正依頼1029 本番確認 1366 幅）', () => {
  it('選んだ枚数が入れ物の幅に収まらないときは、収まる枚数に減らして、その枚数ぶんの幅で描く', () => {
    // 入れ物 320px: 2枚なら 1枚 120px を割るので1枚に減らす（120px の1列に折り返さない）
    expect(fitPerRow(320, 2)).toBe(1);
    expect(thumbWidthFor(320, fitPerRow(320, 2))).toBe(268);
    // 入れ物 340px なら2枚並ぶ。4枚を選んでも2枚まで
    expect(fitPerRow(340, 2)).toBe(2);
    expect(fitPerRow(340, 4)).toBe(2);
    expect(fitPerRow(1200, 4)).toBe(4);
  });
});
