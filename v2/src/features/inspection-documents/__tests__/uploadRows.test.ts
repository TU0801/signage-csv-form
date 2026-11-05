import { describe, expect, it } from 'vitest';
import { makeInspection } from '@/features/inspection-portal/__tests__/fixtures';
import {
  EMPTY_ROW_STATE,
  applyBulk,
  assignRowNames,
  buildRows,
  checkRow,
  dropAiValues,
  isBlankPixels,
  mergeAuto,
  reviewReasons,
  rowPageLabel,
  setFields,
  type UploadSource,
} from '../lib/uploadRows';
import { clampLeftWidth, renderWidthFor, submitGate } from '../lib/uploadView';

const pdf = (over: Partial<UploadSource> = {}): UploadSource => ({
  id: 's1',
  file: new File(['%PDF'], 'a.pdf', { type: 'application/pdf' }),
  kind: 'pdf',
  pageCount: 4,
  breaks: new Set([2]),
  removed: new Set([1]),
  ...over,
});

describe('uploadRows（修正依頼1029(1) ファイルのアップロードの表）', () => {
  it('PDF は区間ごと、ほかの形式は1ファイル1行。削除したページは送るページから外す', () => {
    const video: UploadSource = { ...pdf({ id: 's2' }), file: new File(['x'], 'v.mp4'), kind: 'video', pageCount: 0 };
    const rows = buildRows([pdf(), video]);
    expect(rows.map((r) => [r.key, r.pages, r.no])).toEqual([
      ['s1:0', [0], 1],
      ['s1:2', [2, 3], 2],
      ['s2', [], 3],
    ]);
    expect(rowPageLabel(rows[0]!)).toBe('p.1-2（1ページ削除）');
    expect(rowPageLabel(rows[2]!)).toBe('—');
  });

  it('自動の値は空の項目だけ埋め、食い違いは要確認にする。手で直すと解消する', () => {
    let s = mergeAuto(EMPTY_ROW_STATE, { propertyCode: 'P1', performedOn: '2026-10-25' }, 'filename');
    s = mergeAuto(s, { propertyCode: 'P2', inspectionType: 'エレベーター定期点検' }, 'text');
    expect(s.input).toMatchObject({ propertyCode: 'P1', inspectionType: 'エレベーター定期点検' });
    expect(s.conflicts.propertyCode).toEqual({ value: 'P2', source: 'text' });
    const row = buildRows([pdf({ breaks: new Set(), removed: new Set() })])[0]!;
    const ctx = { inspections: [], source: undefined, size: null, canReport: true };
    expect(checkRow(row, setFields(s, { category: 'estimate' }, 'manual'), ctx).needsReview).toBe(true);
    const fixed = setFields(s, { category: 'estimate', propertyCode: 'P1' }, 'manual');
    expect(checkRow(row, fixed, ctx).needsReview).toBe(false);
  });

  it('画面の既定（報告書一括アップロードの区分）はファイル名で読めた区分に黙って譲る（要確認にしない）', () => {
    const s = mergeAuto(setFields(EMPTY_ROW_STATE, { category: 'report' }, 'default'), { category: 'estimate' }, 'filename');
    expect(s.input.category).toBe('estimate');
    expect(s.conflicts).toEqual({});
  });

  it('一括設定は「変更しない」の項目を変えず、選択中の行だけに入れる', () => {
    const states = {
      a: setFields(EMPTY_ROW_STATE, { note: 'a のメモ', category: 'invoice' }, 'manual'),
      b: EMPTY_ROW_STATE,
    };
    const next = applyBulk(states, ['a'], { category: 'estimate', note: undefined });
    expect(next.a!.input).toMatchObject({ category: 'estimate', note: 'a のメモ' });
    expect(next.b).toBe(states.b);
  });

  it('報告書の行は PDF だけ。物件・点検種別・保守会社で点検が1件に決まれば送れる', () => {
    const inspections = [
      makeInspection({ inspection_id: 'i1', property_code: 'P1', inspection_type_label: 'EV', vendor_id: 'v1' }),
      makeInspection({ inspection_id: 'i2', property_code: 'P1', inspection_type_label: 'EV', vendor_id: 'v2' }),
    ];
    const row = buildRows([pdf({ breaks: new Set(), removed: new Set() })])[0]!;
    const base = setFields(
      EMPTY_ROW_STATE,
      { category: 'report', propertyCode: 'P1', inspectionType: 'EV', performedOn: '2026-10-25' },
      'manual',
    );
    const ctx = { inspections, source: pdf(), size: 100, canReport: true };
    expect(checkRow(row, base, ctx).errors.inspection).toMatch(/点検が2件/);
    const picked = checkRow(row, setFields(base, { vendorId: 'v2' }, 'manual'), ctx);
    expect(picked.inspection?.inspection_id).toBe('i2');
    expect(picked.needsReview).toBe(false);
    const image = { ...pdf(), kind: 'image' as const };
    expect(checkRow(row, base, { ...ctx, source: image }).errors.file).toMatch(/PDF だけ/);
  });

  it('修正依頼1104 E1: 区分と実施日が食い違った行は、実施日だけ直しても要確認だが、止めずに確認のうえ登録できる（入力漏れは止める）', () => {
    const inspections = [makeInspection({ inspection_id: 'i1', property_code: 'P1', inspection_type_label: 'EV', vendor_id: 'v1' })];
    const row = buildRows([pdf({ breaks: new Set(), removed: new Set() })])[0]!;
    const ctx = { inspections, source: pdf(), size: 100, canReport: true };
    let s = setFields(EMPTY_ROW_STATE, { category: 'report', propertyCode: 'P1', inspectionType: 'EV', performedOn: '2026-12-01' }, 'preset');
    s = mergeAuto(s, { category: 'estimate', performedOn: '2026-10-25' }, 'text');
    s = setFields(s, { performedOn: '2026-11-05' }, 'manual');
    const check = checkRow(row, s, ctx);
    expect(check.needsReview).toBe(true);
    const reasons = reviewReasons(s, check);
    expect(reasons.map((r) => [r.kind, r.label])).toEqual([['conflict', '区分']]);
    expect(submitGate(['r'], { r: reasons })).toEqual({ blocking: [], confirmable: ['r'] });
    // 「今の値のままにする」（今の値を手入力として入れ直す）で解消する
    expect(checkRow(row, setFields(s, { category: s.input.category }, 'manual'), ctx).needsReview).toBe(false);
    // 物件が無い行は止める
    const noProperty = setFields(s, { propertyCode: '' }, 'manual');
    const r2 = reviewReasons(noProperty, checkRow(row, noProperty, ctx));
    expect(submitGate(['r'], { r: r2 }).blocking).toEqual(['r']);
  });

  it('修正依頼1104 E11: AI-OCR で入れた値と AI の食い違いだけを外す', () => {
    let s = mergeAuto(EMPTY_ROW_STATE, { propertyCode: 'P1' }, 'filename');
    s = mergeAuto(s, { propertyCode: 'P2', inspectionType: 'EV' }, 'ai');
    const dropped = dropAiValues(s);
    expect(dropped.input).toMatchObject({ propertyCode: 'P1', inspectionType: '' });
    expect(dropped.sources).toEqual({ propertyCode: 'filename' });
    expect(dropped.conflicts).toEqual({});
  });

  it('修正依頼1104 E10: 登録済みの名前と重ならない連番にする（2回に分けて登録しても同じ名前にしない）', () => {
    const nameAt = (_k: string, i: number, total: number) => (total > 1 ? `x_${i + 1}.pdf` : 'x.pdf');
    expect(assignRowNames([{ key: 'a', base: 'x' }], nameAt)).toEqual({ a: 'x.pdf' });
    expect(
      assignRowNames(
        [
          { key: 'a', base: 'x', saved: 'x_1.pdf' },
          { key: 'b', base: 'x' },
          { key: 'c', base: 'x' },
        ],
        nameAt,
      ),
    ).toEqual({ a: 'x_1.pdf', b: 'x_2.pdf', c: 'x_3.pdf' });
    // 1件目だけ先に登録した後、2件目の名前が「x.pdf」と重なるときは連番の形にする
    expect(assignRowNames([{ key: 'a', base: 'x', saved: 'x.pdf' }, { key: 'b', base: 'y' }, { key: 'c', base: 'x' }], nameAt).c).toBe('x_1.pdf');
  });

  it('修正依頼1104 E8・E9: 描く幅は2倍以上（上限 1600px）、左の幅は左右の最小に収める', () => {
    expect(renderWidthFor(300, 1)).toBe(600);
    expect(renderWidthFor(300, 4)).toBe(900);
    expect(renderWidthFor(1000, 2)).toBe(1600);
    expect(clampLeftWidth(100, 1200, 12)).toBe(360);
    expect(clampLeftWidth(1000, 1200, 12)).toBe(1200 - 12 - 320);
  });

  it('空白ページは画素のほとんどが白いもの', () => {
    const white = new Uint8ClampedArray(400 * 4).fill(255);
    expect(isBlankPixels(white)).toBe(true);
    const inked = white.slice();
    for (let i = 0; i < 40 * 4; i += 4) inked.set([0, 0, 0, 255], i);
    expect(isBlankPixels(inked)).toBe(false);
  });
});
