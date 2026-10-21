import { describe, expect, it } from 'vitest';
import {
  addMonths,
  buildSchedule,
  countSchedule,
  entryMatches,
  todayJst,
  unscheduledInspections,
} from '../lib/schedule';
import type { DbInspectionReport, PortalEntryRow, PortalInspectionRow } from '@/types/portal';

const inspection = (over: Partial<PortalInspectionRow> = {}): PortalInspectionRow => ({
  inspection_id: 'i1',
  property_code: '120409-00',
  property_name: 'テストマンション',
  terminal_count: 1,
  terminal_ids: ['T001'],
  management_company_id: 'm1',
  management_company_name: 'テスト管理',
  inspection_type_id: 't1',
  inspection_type_label: 'エレベーター定期点検',
  template_no: '1',
  vendor_id: 'v1',
  vendor_name: 'テスト保守',
  unit_vendor_ids: [],
  inspection_months: [2, 5, 8, 11],
  schedule_from: '2026-04-01',
  remarks: '',
  ...over,
});

const entry = (over: Partial<PortalEntryRow> = {}): PortalEntryRow => ({
  id: 'e1',
  user_id: 'u1',
  property_code: '120409-00',
  inspection_type: 'エレベーター定期点検',
  vendor_name: 'テスト保守',
  vendor_id: 'v1',
  property_inspection_id: 'i1',
  target_month: '2026-05-01',
  inspection_start: '2026-05-10',
  inspection_end: null,
  status: 'draft',
  review_comment: null,
  reviewed_at: null,
  created_at: '2026-05-01T00:00:00Z',
  updated_at: null,
  is_mine: true,
  ...over,
});

const report = (over: Partial<DbInspectionReport> = {}): DbInspectionReport => ({
  id: 'r1',
  property_inspection_id: 'i1',
  property_code: '120409-00',
  property_name: 'テストマンション',
  inspection_type_id: 't1',
  inspection_type_label: 'エレベーター定期点検',
  vendor_id: 'v1',
  vendor_name: 'テスト保守',
  target_month: '2026-05-01',
  performed_on: '2026-05-12',
  entry_id: null,
  file_name: '20260512_テストマンション_エレベーター定期点検.pdf',
  original_name: 'a.pdf',
  size_bytes: 1,
  mime: 'application/pdf',
  content_hash: null,
  storage_backend: 'supabase',
  storage_path: 'i1/x.pdf',
  status: 'submitted',
  status_before_delete: null,
  note: null,
  review_comment: null,
  reviewed_by: null,
  reviewed_at: null,
  uploaded_by: 'u1',
  archived_at: null,
  retention_until: null,
  created_at: '2026-05-12T00:00:00Z',
  updated_at: '2026-05-12T00:00:00Z',
  ...over,
});

describe('todayJst', () => {
  it('UTC では前日でも日本時間の日付を返す', () => {
    // 2026-10-31T16:00Z = 日本時間 11/1 01:00
    expect(todayJst(new Date('2026-10-31T16:00:00Z'))).toBe('2026-11-01');
  });
});

describe('addMonths', () => {
  it('年をまたぐ', () => {
    expect(addMonths('2026-11-01', 3)).toBe('2027-02-01');
    expect(addMonths('2026-01-01', -1)).toBe('2025-12-01');
  });
});

describe('buildSchedule', () => {
  it('登録月から先の点検月だけを並べ、過ぎた月で申請が無いものを超過にする', () => {
    const items = buildSchedule([inspection()], [], [], { today: '2026-10-21', monthsAhead: 3 });
    expect(items.map((i) => i.targetMonth)).toEqual(['2026-05-01', '2026-08-01', '2026-11-01']);
    expect(items.map((i) => i.timing)).toEqual(['overdue', 'overdue', 'upcoming']);
    expect(countSchedule(items).overdueUnapplied).toBe(2);
  });

  it('申請（承認待ち・承認済み）があれば超過にしない。差戻し（pending）は未申請として超過に数える', () => {
    const items = buildSchedule(
      [inspection()],
      [entry(), entry({ id: 'e2', target_month: '2026-08-01', status: 'pending', review_comment: '日付違い' })],
      [],
      { today: '2026-10-21' },
    );
    const may = items.find((i) => i.targetMonth === '2026-05-01')!;
    const aug = items.find((i) => i.targetMonth === '2026-08-01')!;
    expect(may.application).toBe('applied');
    expect(may.overdueUnapplied).toBe(false);
    expect(aug.application).toBe('sent_back');
    expect(aug.overdueUnapplied).toBe(true);
  });

  it('月末を過ぎるまでは超過にしない（今月は current）', () => {
    const items = buildSchedule([inspection({ inspection_months: [10] })], [], [], { today: '2026-10-31' });
    expect(items[0]!.timing).toBe('current');
    expect(items[0]!.overdueUnapplied).toBe(false);
  });

  it('点検月の無い点検行は予定に出さず、unscheduledInspections に出す', () => {
    const none = inspection({ inspection_id: 'i2', inspection_months: [] });
    expect(buildSchedule([none], [], [], { today: '2026-10-21' })).toEqual([]);
    expect(unscheduledInspections([inspection(), none])).toEqual([none]);
  });

  it('最新の報告書（置き換え済み・削除済みを除く）を予定に付ける', () => {
    const items = buildSchedule(
      [inspection()],
      [],
      [
        report({ id: 'old', status: 'superseded', created_at: '2026-05-13T00:00:00Z' }),
        report({ id: 'cur', status: 'returned', created_at: '2026-05-12T00:00:00Z' }),
        report({ id: 'del', status: 'deleted', created_at: '2026-05-14T00:00:00Z' }),
      ],
      { today: '2026-10-21' },
    );
    const may = items.find((i) => i.targetMonth === '2026-05-01')!;
    expect(may.report?.id).toBe('cur');
    expect(countSchedule(items).reportsReturned).toBe(1);
  });
});

describe('entryMatches', () => {
  it('旧来の申請（点検の紐付けなし）は物件コードの -00 の揺れを吸収し、点検種別名と点検開始日の月で照合する', () => {
    const legacy = entry({ property_inspection_id: null, target_month: null, property_code: '120409', inspection_start: '2026-08-03' });
    expect(entryMatches(legacy, inspection(), '2026-08-01')).toBe(true);
    expect(entryMatches(legacy, inspection(), '2026-05-01')).toBe(false);
    expect(entryMatches({ ...legacy, inspection_type: '定期清掃' }, inspection(), '2026-08-01')).toBe(false);
  });

  it('点検の紐付けがある申請は ID と対象月だけで照合する', () => {
    expect(entryMatches(entry(), inspection({ inspection_id: 'other' }), '2026-05-01')).toBe(false);
  });
});
