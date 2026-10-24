import { describe, expect, it } from 'vitest';
import { buildSchedule, type ScheduleItem } from '../lib/schedule';
import { filterSchedule, filterUnscheduled, INITIAL_FILTERS } from '../lib/filters';
import { countStatuses, itemStatus, STATUS_ORDER } from '../lib/status';
import { buildUnscheduledItems } from '../components/UnscheduledTable';
import { makeEntry, makeInspection, makeReport } from './fixtures';

const TODAY = '2026-10-21';
const statusOf = (item: ScheduleItem) => itemStatus(item, new Set(), TODAY);

describe('点検一覧の絞り込み', () => {
  it('既定（超過＋今月＋今後3か月）は過去の申請済みと4か月先以降を出さない', () => {
    const items = buildSchedule(
      [makeInspection({ inspection_months: [5, 8, 11, 2], schedule_from: '2026-04-01' })],
      [makeEntry({ target_month: '2026-05-01', status: 'ready' })],
      [],
      { today: TODAY, monthsAhead: 12 },
    );
    const shown = filterSchedule(items, INITIAL_FILTERS, TODAY, statusOf).map((i) => i.targetMonth);
    // 5月は承認済み（出さない）、8月は超過（出す）、11月は今後3か月以内、2月は4か月先（出さない）
    expect(shown).toEqual(['2026-08-01', '2026-11-01']);
    expect(filterSchedule(items, { ...INITIAL_FILTERS, timing: 'all' }, TODAY, statusOf)).toHaveLength(items.length);
  });

  it('ステータスの件数とステータスで絞った行の数が一致する', () => {
    const inspections = [
      makeInspection(),
      makeInspection({ inspection_id: 'i2', property_code: '900002-00', property_name: 'テスト第二マンション' }),
    ];
    const items = buildSchedule(
      inspections,
      [makeEntry({ id: 'e1', status: 'draft' }), makeEntry({ id: 'e2', property_inspection_id: 'i2', status: 'pending', review_comment: '日付違い' })],
      [makeReport({ status: 'returned' })],
      { today: TODAY, monthsAhead: 12 },
    );
    const counts = countStatuses(items.map(statusOf));
    for (const status of STATUS_ORDER) {
      const rows = filterSchedule(items, { ...INITIAL_FILTERS, timing: 'all', status }, TODAY, statusOf);
      expect(rows, status).toHaveLength(counts[status]);
    }
    expect(counts.report_returned).toBe(1);
    expect(counts.sent_back).toBe(1);
  });

  it('物件名・コードの検索、管理会社（未設定）で絞る', () => {
    const items = buildSchedule(
      [
        makeInspection(),
        makeInspection({ inspection_id: 'i2', property_code: '900002-00', property_name: 'テスト第二', vendor_id: 'v2', unit_vendor_ids: ['v3'], management_company_id: null }),
      ],
      [],
      [],
      { today: TODAY, monthsAhead: 12 },
    );
    const ids = (f: Partial<typeof INITIAL_FILTERS>) =>
      [...new Set(filterSchedule(items, { ...INITIAL_FILTERS, timing: 'all', ...f }, TODAY, statusOf).map((i) => i.inspection.inspection_id))];
    expect(ids({ search: '９００００２' })).toEqual(['i2']);
    expect(ids({ search: '第一' })).toEqual(['i1']);
    expect(ids({ managementCompanyId: '__none__' })).toEqual(['i2']);
  });

  it('点検月の無い点検の行にもステータスで絞り込みをかけ、超過（起きない）では出さない', () => {
    const items = buildUnscheduledItems(
      [makeInspection({ inspection_months: [] }), makeInspection({ inspection_id: 'i2', inspection_months: [] })],
      [makeEntry({ property_inspection_id: 'i1', status: 'draft' })],
      [],
    );
    expect(filterUnscheduled(items, { ...INITIAL_FILTERS, status: 'applying' }, statusOf).map((i) => i.inspection.inspection_id)).toEqual(['i1']);
    expect(filterUnscheduled(items, { ...INITIAL_FILTERS, timing: 'overdue' }, statusOf)).toEqual([]);
  });
});
