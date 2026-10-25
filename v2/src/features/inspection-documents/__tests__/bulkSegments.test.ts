import { describe, expect, it } from 'vitest';
import { makeEntry, makeInspection } from '@/features/inspection-portal/__tests__/fixtures';
import { makeReport } from './fixtures';
import {
  UNSCHEDULED_GROUP,
  buildSegments,
  buildTargets,
  identicalLiveReport,
  reportToReplace,
  toggleBreak,
  validateSegments,
} from '../lib/bulkSegments';
import { typeFlagsMap } from '@/features/inspection-portal/lib/schedule';
import { buildUnitIndex } from '@/features/inspection-portal/lib/units';

describe('buildSegments / toggleBreak', () => {
  it('区切りの位置でページを区間に分け、同じ位置をもう一度押すと区切りが外れる', () => {
    // A A | B | C C C
    let breaks = toggleBreak(new Set(), 2);
    breaks = toggleBreak(breaks, 3);
    expect(buildSegments(6, breaks)).toEqual([
      { start: 0, end: 1, no: 1 },
      { start: 2, end: 2, no: 2 },
      { start: 3, end: 5, no: 3 },
    ]);
    breaks = toggleBreak(breaks, 2);
    expect(buildSegments(6, breaks)).toEqual([
      { start: 0, end: 2, no: 1 },
      { start: 3, end: 5, no: 2 },
    ]);
  });
});

describe('buildTargets', () => {
  it('選択中の保守会社の点検だけを、予定（対象月つき）と点検月未登録（対象月なし）に分けて出す', () => {
    const inspections = [
      makeInspection({ inspection_id: 'i1', inspection_months: [9], schedule_from: '2026-04-01' }),
      makeInspection({ inspection_id: 'i2', inspection_months: [], property_name: 'テスト第二マンション' }),
      makeInspection({ inspection_id: 'i3', vendor_id: 'v2', inspection_months: [9] }),
      // ほかの台を受け持つ点検行も選べる
      makeInspection({ inspection_id: 'i4', vendor_id: 'v2', unit_vendor_ids: ['v1'], inspection_months: [] }),
    ];
    const entries = [makeEntry({ id: 'e9', property_inspection_id: 'i1', target_month: '2026-09-01', status: 'ready' })];
    const targets = buildTargets(inspections, entries, [], 'v1', '2026-10-24');
    expect(targets.map((t) => t.key)).toEqual(['i1:2026-09-01', 'i2:none', 'i4:none']);
    expect(targets[0]).toMatchObject({ targetMonth: '2026-09-01', entryId: 'e9', group: '2026年9月' });
    expect(targets[0]!.label).toContain('2026年9月');
    expect(targets[1]).toMatchObject({ targetMonth: null, entryId: null, group: UNSCHEDULED_GROUP });
  });

  it('毎月の点検種別は毎月の選択肢を出し、台が2台以上の点検は1つの選択肢に台の No を添える（修正依頼1025 G4・H1）', () => {
    const inspections = [
      // 点検月未登録でも毎月の印があれば予定（毎月）に出る
      makeInspection({ inspection_id: 'i1', inspection_type_id: 't-remote', inspection_months: [], schedule_from: '2026-09-01' }),
      makeInspection({ inspection_id: 'i2', inspection_months: [10], schedule_from: '2026-09-01' }),
    ];
    const flags = typeFlagsMap([{ inspection_type_id: 't-remote', report_only: true, monthly: true }]);
    const units = buildUnitIndex([
      { inspection_id: 'i2', unit_id: 'u1', unit_code: 'No1', unit_sort: 0, maintainer_id: 'v1', inspection_months: [], inspected_on: null, equipment_code: null },
      { inspection_id: 'i2', unit_id: 'u2', unit_code: 'No2', unit_sort: 1, maintainer_id: 'v1', inspection_months: [], inspected_on: null, equipment_code: null },
    ]);
    const targets = buildTargets(inspections, [], [], 'v1', '2026-10-24', 1, { flags, units });
    expect(targets.map((t) => t.key)).toEqual(['i1:2026-11-01', 'i1:2026-10-01', 'i2:2026-10-01', 'i1:2026-09-01']);
    expect(targets.find((t) => t.key === 'i2:2026-10-01')!.label).toContain('（No1・No2）');
  });
});

describe('validateSegments', () => {
  const targets = buildTargets(
    [
      makeInspection({ inspection_id: 'i1', inspection_months: [9], schedule_from: '2026-04-01' }),
      makeInspection({ inspection_id: 'i2', inspection_months: [] }),
    ],
    [],
    [],
    'v1',
    '2026-10-24',
  );
  const map = new Map(targets.map((t) => [t.key, t]));
  const segs = buildSegments(4, new Set([1, 2, 3]));

  it('点検と実施日の未入力を区間ごとに返す（実施日は全区間の既定値で埋まる）', () => {
    const errors = validateSegments(segs.slice(0, 2), { 0: { targetKey: 'i1:2026-09-01', performedOn: '', note: '' } }, map, '');
    expect(errors[0]).toEqual({ performedOn: '実施日を入力してください' });
    expect(errors[1]).toEqual({ target: '点検を選んでください', performedOn: '実施日を入力してください' });
    expect(validateSegments(segs.slice(0, 1), { 0: { targetKey: 'i1:2026-09-01', performedOn: '', note: '' } }, map, '2026-09-10')).toEqual({});
  });

  it('同じ点検・対象月を2つの区間に割り当てたら両方を止める（点検月未登録は実施日の月で比べる）', () => {
    const errors = validateSegments(
      segs,
      {
        0: { targetKey: 'i1:2026-09-01', performedOn: '', note: '' },
        1: { targetKey: 'i1:2026-09-01', performedOn: '', note: '' },
        2: { targetKey: 'i2:none', performedOn: '2026-08-03', note: '' },
        3: { targetKey: 'i2:none', performedOn: '2026-09-03', note: '' },
      },
      map,
      '2026-09-10',
    );
    expect(Object.keys(errors).map(Number)).toEqual([0, 1]);
    expect(errors[0]!.target).toContain('区間1・区間2');
  });
});

describe('reportToReplace', () => {
  it('DB と同じく、提出する保守会社（アカウントの会社、無ければ最新の版の会社）の提出済みの版だけを置き換える', () => {
    const target = {
      key: 'i1:2026-11-01',
      inspection: makeInspection({ inspection_id: 'i1', vendor_id: 'v1', unit_vendor_ids: ['v2'] }),
      targetMonth: '2026-11-01',
      entryId: null,
      group: '',
      label: '',
    };
    const base = { property_inspection_id: 'i1', target_month: '2026-11-01' };
    const reports = [
      makeReport({ ...base, id: 'old-v1', vendor_id: 'v1', created_at: '2026-11-01T00:00:00Z' }),
      makeReport({ ...base, id: 'new-v2', vendor_id: 'v2', created_at: '2026-11-02T00:00:00Z' }),
      makeReport({ ...base, id: 'gone', vendor_id: 'v1', status: 'superseded', created_at: '2026-11-03T00:00:00Z' }),
      makeReport({ ...base, id: 'other-month', vendor_id: 'v1', target_month: '2026-05-01' }),
    ];
    // 保守会社 v1 のアカウント: 他社（v2）の新しい版ではなく自社の版
    expect(reportToReplace(reports, target, '2026-11-10', 'v1')?.id).toBe('old-v1');
    // 管理者（アカウントの会社なし）: 最新の版の会社（v2）の版
    expect(reportToReplace(reports, target, '2026-11-10', null)?.id).toBe('new-v2');
    // 提出済みの版の無い会社
    expect(reportToReplace(reports, target, '2026-11-10', 'v3')).toBeNull();
    // 同じ点検でも別の月の版は置き換えない
    expect(reportToReplace(reports, { ...target, targetMonth: '2026-12-01' }, '2026-12-10', 'v1')).toBeNull();
  });
});

describe('identicalLiveReport', () => {
  it('同じ点検の提出中・受領済みの同じ内容の版だけを数え、同じ対象月の版を優先する', () => {
    const base = { property_inspection_id: 'i1', content_hash: 'h' };
    const reports = [
      makeReport({ ...base, id: 'returned', status: 'returned', target_month: '2026-11-01' }),
      makeReport({ ...base, id: 'deleted', status: 'deleted', target_month: '2026-11-01' }),
      makeReport({ ...base, id: 'superseded', status: 'superseded', target_month: '2026-11-01' }),
      makeReport({ ...base, id: 'other-inspection', property_inspection_id: 'i2', status: 'submitted', target_month: '2026-11-01' }),
      makeReport({ ...base, id: 'other-hash', content_hash: 'x', status: 'submitted', target_month: '2026-11-01' }),
      makeReport({ ...base, id: 'may', status: 'accepted', target_month: '2026-05-01', created_at: '2026-06-01T00:00:00Z' }),
    ];
    // 同じ月は差戻し・削除・置き換え済みしか無いので、別の月の受領済みの版
    expect(identicalLiveReport(reports, 'i1', '2026-11-01', 'h')?.id).toBe('may');
    const same = makeReport({ ...base, id: 'nov', status: 'submitted', target_month: '2026-11-01', created_at: '2026-01-01T00:00:00Z' });
    expect(identicalLiveReport([...reports, same], 'i1', '2026-11-01', 'h')?.id).toBe('nov');
    expect(identicalLiveReport(reports.slice(0, 5), 'i1', '2026-11-01', 'h')).toBeNull();
  });
});
