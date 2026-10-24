import { describe, expect, it } from 'vitest';
import { buildSchedule } from '../lib/schedule';
import { buildUnscheduledItems } from '../components/UnscheduledTable';
import { completionKey, completionMonth, inspectionStatus, itemStatus } from '../lib/status';
import { makeEntry, makeInspection, makeReport } from './fixtures';

const TODAY = '2026-10-21';

/** 11月の予定1件（点検月 5・11、4月登録） */
function novItem(entries = [makeEntry()], reports = [makeReport({ status: 'deleted' })]) {
  const items = buildSchedule([makeInspection()], entries, reports, { today: TODAY, monthsAhead: 12 });
  return items.find((i) => i.targetMonth === '2026-11-01')!;
}

describe('点検のステータス（B14）', () => {
  it('申請・報告書・完了連絡の組み合わせから5種と未申請・差戻しを決める', () => {
    const s = (item: Parameters<typeof inspectionStatus>[0], completed = false, today = TODAY) =>
      inspectionStatus(item, { completed, today });
    // 未申請 / 申請済み（承認待ち）= 申請中
    expect(s(novItem([]))).toBe('not_applied');
    expect(s(novItem([makeEntry({ status: 'draft' })]))).toBe('applying');
    // 承認済みで点検日がまだ = 申請中、過ぎて報告書なし = 未提出（終了日が無ければ開始日で判定）
    const approved = novItem([makeEntry({ status: 'ready', inspection_start: '2026-11-10', inspection_end: '2026-11-11' })]);
    expect(s(approved)).toBe('applying');
    expect(s(approved, false, '2026-11-12')).toBe('report_missing');
    expect(s(approved, false, '2026-11-11')).toBe('applying');
    // 報告書: 確認待ち＝提出済、差戻し、受領＝完了
    expect(s(novItem([makeEntry({ status: 'ready' })], [makeReport({ status: 'submitted' })]))).toBe('report_submitted');
    expect(s(novItem([makeEntry({ status: 'ready' })], [makeReport({ status: 'returned' })]))).toBe('report_returned');
    expect(s(novItem([makeEntry({ status: 'ready' })], [makeReport({ status: 'accepted' })]))).toBe('completed');
    // 完了連絡があれば報告書が無くても完了
    expect(s(novItem([]), true)).toBe('completed');
    // 差戻し
    expect(s(novItem([makeEntry({ status: 'pending', review_comment: '日付違い' })]))).toBe('sent_back');
  });

  it('点検月を過ぎて申請が無ければ超過（差戻しのまま過ぎたものも超過）', () => {
    const items = buildSchedule([makeInspection()], [], [], { today: TODAY, monthsAhead: 12 });
    const may = items.find((i) => i.targetMonth === '2026-05-01')!;
    expect(itemStatus(may, new Set(), TODAY)).toBe('overdue');
    // 5月分の完了連絡があれば完了
    expect(itemStatus(may, new Set([completionKey('i1', '2026-05-01')]), TODAY)).toBe('completed');
  });

  it('点検月の無い点検の完了連絡は、申請の対象月（無ければ点検開始日の月）に付ける', () => {
    const [withMonth] = buildUnscheduledItems([makeInspection({ inspection_months: [] })], [makeEntry({ target_month: '2026-09-01' })], []);
    expect(completionMonth(withMonth!)).toBe('2026-09-01');
    const [byStart] = buildUnscheduledItems(
      [makeInspection({ inspection_months: [] })],
      [makeEntry({ target_month: null, inspection_start: '2026-07-15' })],
      [],
    );
    expect(completionMonth(byStart!)).toBe('2026-07-01');
    const [none] = buildUnscheduledItems([makeInspection({ inspection_months: [] })], [], []);
    expect(completionMonth(none!)).toBeNull();
  });
});
