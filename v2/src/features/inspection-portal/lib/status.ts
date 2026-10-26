import type { DbInspectionCompletion } from '@/types/database';
import { focusEntry, monthOf, type ScheduleItem } from './schedule';

/*
 * 点検のステータス（修正依頼1024 B14）。既存の状態（申請・報告書・完了連絡）から自動で決める。
 * 点検登録フォームの行と、管理会社の点検一覧で共通に使う。
 */

export type InspectionStatus =
  | 'completed'
  | 'report_submitted'
  | 'report_returned'
  | 'report_missing'
  | 'applying'
  | 'overdue'
  | 'sent_back'
  | 'not_applied';

/** 表示順（絞り込み・件数の並び）。5種（超過・未提出・申請中・提出済・完了）の後に差戻しと未申請 */
export const STATUS_ORDER: InspectionStatus[] = [
  'overdue',
  'report_missing',
  'applying',
  'report_submitted',
  'completed',
  'sent_back',
  'report_returned',
  'not_applied',
];

export const STATUS_LABEL: Record<InspectionStatus, string> = {
  completed: '点検完了',
  report_submitted: '報告書提出済',
  report_returned: '報告書差戻し',
  report_missing: '報告書未提出',
  applying: '点検予定申請中',
  overdue: '点検月超過',
  sent_back: '申請差戻し',
  not_applied: '未申請',
};

/** 色（注記のスクショ: 超過＝赤系、申請中＝青、提出済・完了＝緑系） */
export const STATUS_TONE: Record<InspectionStatus, string> = {
  overdue: 'bg-red-100 text-red-800 ring-1 ring-red-300',
  report_missing: 'bg-pink-100 text-pink-800 ring-1 ring-pink-300',
  applying: 'bg-sky-500 text-white',
  report_submitted: 'bg-lime-200 text-lime-900',
  completed: 'bg-green-600 text-white',
  sent_back: 'bg-amber-100 text-amber-800 ring-1 ring-amber-300',
  report_returned: 'bg-amber-100 text-amber-800 ring-1 ring-amber-300',
  not_applied: 'bg-gray-100 text-gray-600',
};

/** 完了連絡の照合キー（点検行 × 対象月。台ごとの完了連絡は台も。修正依頼1026 I7） */
export function completionKey(inspectionId: string, targetMonth: string, unitId?: string | null): string {
  return unitId ? `${inspectionId}:${targetMonth}:${unitId}` : `${inspectionId}:${targetMonth}`;
}

export function completionKeys(
  completions: Pick<DbInspectionCompletion, 'property_inspection_id' | 'target_month' | 'property_unit_id'>[],
): Set<string> {
  return new Set(completions.map((c) => completionKey(c.property_inspection_id, c.target_month, c.property_unit_id)));
}

/**
 * 行の完了連絡のキー（その行で記録・取り消しするもの）。台ごとに分けた行は台のキー、それ以外は点検行 × 対象月。
 * 対象月が決まらなければ null
 */
export function rowCompletionKey(item: Pick<ScheduleItem, 'targetMonth' | 'entries' | 'inspection' | 'unit'>): string | null {
  const month = completionMonth(item);
  return month ? completionKey(item.inspection.inspection_id, month, item.unit?.unit_id) : null;
}

/**
 * 行が完了連絡済みか。台ごとの行は、その台の完了連絡か台なしの完了連絡（点検行 × 対象月の全体。台ごとに分ける前の記録）のどちらか
 */
export function isRowCompleted(
  item: Pick<ScheduleItem, 'targetMonth' | 'entries' | 'inspection' | 'unit'>,
  completed: ReadonlySet<string>,
): boolean {
  const month = completionMonth(item);
  if (!month) return false;
  if (completed.has(completionKey(item.inspection.inspection_id, month))) return true;
  return !!item.unit?.unit_id && completed.has(completionKey(item.inspection.inspection_id, month, item.unit.unit_id));
}

/**
 * 完了連絡に使う対象月。予定の行はその月。点検月の無い点検の行は、紐付いた申請の対象月（無ければ点検開始日の月）。
 * どれも無ければ null（完了連絡は出せない）
 */
export function completionMonth(item: Pick<ScheduleItem, 'targetMonth' | 'entries'>): string | null {
  if (item.targetMonth) return item.targetMonth;
  const e = focusEntry(item.entries);
  if (e?.target_month) return e.target_month;
  if (e?.inspection_start) return `${e.inspection_start.slice(0, 7)}-01`;
  return null;
}

/**
 * ステータスを決める（上から順に当てはめる）。
 * 点検完了: 報告書が受領済み、または完了連絡あり／報告書提出済: 報告書が確認待ち／報告書差戻し／
 * 報告書未提出: 申請が承認済み（取込済みを含む）で点検終了日（無ければ開始日）が今日より前、かつ報告書なし／
 * 点検予定申請中: 申請済み（承認待ち）、または承認済みで点検日がまだ／点検月超過: 点検月を過ぎて申請なし／
 * 申請差戻し／それ以外は未申請
 */
export function inspectionStatus(
  item: Pick<ScheduleItem, 'application' | 'overdueUnapplied' | 'entries' | 'report'>,
  opts: { completed: boolean; today: string },
): InspectionStatus {
  if (opts.completed || item.report?.status === 'accepted') return 'completed';
  if (item.report?.status === 'submitted') return 'report_submitted';
  if (item.report?.status === 'returned') return 'report_returned';
  if (item.application === 'approved') {
    const e = focusEntry(item.entries);
    const last = e?.inspection_end || e?.inspection_start || '';
    return last && last < opts.today ? 'report_missing' : 'applying';
  }
  if (item.application === 'applied') return 'applying';
  if (item.overdueUnapplied) return 'overdue';
  if (item.application === 'sent_back') return 'sent_back';
  return 'not_applied';
}

/** 行の完了連絡の有無を含めてステータスを決める */
export function itemStatus(
  item: Pick<
    ScheduleItem,
    'application' | 'overdueUnapplied' | 'entries' | 'report' | 'targetMonth' | 'inspection' | 'reportOnly' | 'unit'
  >,
  completed: ReadonlySet<string>,
  today: string,
): InspectionStatus {
  const done = isRowCompleted(item, completed);
  const status = inspectionStatus(item, { completed: done, today });
  // 申請不要（報告書のみ）の点検は申請が無いので、対象月が過ぎて報告書・完了連絡が無ければ「報告書未提出」（修正依頼1025 H4/G4）
  if (item.reportOnly && status === 'not_applied' && item.targetMonth && item.targetMonth < monthOf(today)) {
    return 'report_missing';
  }
  return status;
}

export function countStatuses(statuses: InspectionStatus[]): Record<InspectionStatus, number> {
  const counts = Object.fromEntries(STATUS_ORDER.map((s) => [s, 0])) as Record<InspectionStatus, number>;
  statuses.forEach((s) => {
    counts[s] += 1;
  });
  return counts;
}
