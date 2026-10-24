import { appliedEntry } from '@/features/inspection-portal/lib/actions';
import { focusEntry, type ScheduleItem } from '@/features/inspection-portal/lib/schedule';
import type { BulkEntryRow, BulkNotice, BulkRowInput, BulkScheduleMeta } from '../types';

/*
 * 点検登録フォーム（一括入力）の点検予定の行（修正依頼1024 B13・B14）。
 * 予定（点検行 × 対象月）は点検一覧と同じく buildSchedule / buildUnscheduledItems で作り、表の行にする。
 */

/** 予定の行を表の行の材料にする。申請済み・差戻し中の予定は読み取り（申請の日付・備考を出す）、未申請は点検開始日を空にする */
export function scheduleRowInput(item: ScheduleItem): { meta: BulkScheduleMeta; row: BulkRowInput } {
  const { inspection } = item;
  const unscheduled = !item.targetMonth;
  // 点検月の無い点検は月をまたいでまとめた行なので、いつでも別の月の申請を足せる（読み取りにしない）
  const locked = !unscheduled && item.application !== 'not_applied';
  const entry = locked ? (appliedEntry(item) ?? focusEntry(item.entries)) : null;
  return {
    meta: {
      key: item.key,
      inspectionId: inspection.inspection_id,
      targetMonth: item.targetMonth || null,
      locked,
      propertyName: inspection.property_name,
      terminalIds: inspection.terminal_ids,
    },
    row: {
      propertyCode: inspection.property_code,
      terminalId: entry?.terminal_id ?? inspection.terminal_ids[0] ?? '',
      inspectionType: inspection.inspection_type_label ?? '',
      startDate: entry?.inspection_start ?? '',
      endDate: entry?.inspection_end ?? '',
      remarks: entry?.remarks ?? '',
    },
  };
}

/** 入力済みで申請していない行（ログアウト・保守会社の切り替え・ページ離脱の確認に使う）。予定の行は点検開始日などを入れたものだけ */
export function hasUnsentInput(row: Pick<BulkEntryRow, 'schedule' | 'startDate' | 'remarks' | 'memo'>): boolean {
  if (!row.schedule) return true;
  if (row.schedule.locked) return false;
  return !!(row.startDate || row.remarks || row.memo);
}

/**
 * 申請の対象にする行。手で足した行は全部、予定の行は未申請で点検開始日を入れたものだけ
 * （入れていない予定の行は黙って飛ばす。修正依頼1024 B6〜B14）
 */
export function isApplyTarget(row: Pick<BulkEntryRow, 'schedule' | 'startDate'>): boolean {
  if (!row.schedule) return true;
  return !row.schedule.locked && !!row.startDate;
}

/**
 * 保守会社の点検種別の既定（B9）。(a) その物件×保守会社の点検行の点検種別（点検種別マスターの並び順で先頭）→
 * 無ければ (b) 保守会社に紐付けた点検種別（signage_vendor_inspections の active。同じ並び順で先頭）。どちらも無ければ ''
 */
export function defaultInspectionType(
  propertyCode: string,
  vendorInspections: { propertyCode: string; label: string }[],
  linkedIds: readonly string[],
  notices: BulkNotice[],
): string {
  const order = (label: string) => {
    const i = notices.findIndex((n) => n.inspectionType === label);
    return i === -1 ? Number.MAX_SAFE_INTEGER : i;
  };
  const own = vendorInspections
    .filter((i) => i.propertyCode === propertyCode && i.label)
    .map((i) => i.label)
    .sort((a, b) => order(a) - order(b));
  if (own[0]) return own[0];
  const linked = new Set(linkedIds);
  return notices.find((n) => n.id && linked.has(n.id))?.inspectionType ?? '';
}

/** 2026-04-01 → 2026年4月（検査月の表示。無ければ「-」） */
export function formatInspectedOn(date: string | null | undefined): string {
  if (!date) return '-';
  return `${date.slice(0, 4)}年${Number(date.slice(5, 7))}月`;
}
