import { appliedEntry } from '@/features/inspection-portal/lib/actions';
import { focusEntry, type ScheduleItem } from '@/features/inspection-portal/lib/schedule';
import { parseExtraPosters } from '@/lib/extraPosters';
import type { DbEntry } from '@/types/database';
import type { PortalEntryRow } from '@/types/portal';
import type { BulkEntryRow, BulkNotice, BulkRowInput, BulkScheduleMeta } from '../types';

/*
 * 点検登録フォーム（一括入力）の点検予定の行（修正依頼1024 B13・B14）。
 * 予定（点検行 × 対象月）は点検一覧と同じく buildSchedule / buildUnscheduledItems で作り、表の行にする。
 */

/** 読み取りの予定の行に出す申請（申請済み・差戻し中の予定）。未申請・点検月の無い点検は null */
export function scheduleRowEntry(item: ScheduleItem): PortalEntryRow | null {
  // 点検月の無い点検は月をまたいでまとめた行なので、いつでも別の月の申請を足せる（読み取りにしない）
  const locked = !!item.targetMonth && item.application !== 'not_applied';
  return locked ? (appliedEntry(item) ?? focusEntry(item.entries)) : null;
}

/**
 * 申請済み（承認前）の申請を表の行で直すときの値（修正依頼1026 I11）。申請の行全体（portal_entry_for_edit）から作る。
 * 表示期間が点検日から決まる既定の値なら空に戻す（点検日を直したときに表示期間も追従するように）
 */
export function editRowInput(entry: DbEntry): BulkRowInput {
  const end = entry.inspection_end ?? '';
  const position = Number(entry.poster_position ?? 2);
  return {
    terminalId: entry.terminal_id ?? '',
    startDate: entry.inspection_start ?? '',
    endDate: end && end !== entry.inspection_start ? end : '',
    remarks: entry.remarks ?? '',
    memo: entry.memo ?? '',
    noticeText: entry.announcement ?? '',
    displayTime: entry.display_duration ?? undefined,
    // 表示開始日が点検開始日と同じ（過ぎた予定を申請したときの既定）なら空に戻す（点検開始日を直したときに追従するように）
    displayStartDate:
      entry.display_start_date && entry.display_start_date !== entry.inspection_start ? entry.display_start_date : '',
    displayStartTime: entry.display_start_time ?? '',
    displayEndDate: entry.display_end_date && entry.display_end_date !== end ? entry.display_end_date : '',
    displayEndTime: entry.display_end_time ?? '',
    emergencyContact: entry.emergency_contact ?? '',
    posterType: entry.poster_type === 'custom' ? 'custom' : 'template',
    posterImage: entry.poster_image ?? '',
    extraPosters: parseExtraPosters(entry.extra_posters),
    position: Number.isNaN(position) ? 2 : position,
  };
}

/**
 * 修正中の行の申請を DB の修正（portal_update_submitted_entry）に渡す列にする。buildBulkEntries の行から、直せる列だけを取る
 * （物件・点検・保守会社・状態・台は元の申請のまま）
 */
export function submittedEntryPatch(row: Record<string, unknown>): Record<string, unknown> {
  const keys = [
    'inspection_start',
    'inspection_end',
    'remarks',
    'memo',
    'announcement',
    'terminal_id',
    'emergency_contact',
    'poster_type',
    'poster_image',
    'poster_position',
    'display_duration',
    'display_start_date',
    'display_start_time',
    'display_end_date',
    'display_end_time',
  ];
  const patch: Record<string, unknown> = Object.fromEntries(keys.filter((k) => k in row).map((k) => [k, row[k]]));
  // 追加の貼紙を全部外したときも空にする（buildBulkEntries は無ければ送らない）
  patch.extra_posters = row.extra_posters ?? [];
  // 終了日を省いたときは1日の点検（新しい申請と同じく開始日）
  if (!patch.inspection_end) patch.inspection_end = patch.inspection_start ?? null;
  return patch;
}

/**
 * 予定の行を表の行の材料にする。申請済み・差戻し中の予定は読み取り（申請の日付・備考・メモを出す）、未申請は点検開始日を空にする。
 * memos は申請 id → メモ（portal_entries はメモを返さないので別に読む。fetchEntryMemos）。
 * editing は修正中の申請（申請済み・承認前。修正依頼1026 I11）。渡すと行は入力できる状態で、その申請の値を入れる
 */
export function scheduleRowInput(
  item: ScheduleItem,
  memos?: ReadonlyMap<string, string>,
  editing?: DbEntry | null,
): { meta: BulkScheduleMeta; row: BulkRowInput } {
  const { inspection } = item;
  // 申請不要の点検は、この表から申請しない（入力欄を出さない。修正依頼1025 H4/G4）。台ごとの行は台ごとに申請する（1026 I7）
  const edit = editing && editing.status === 'draft' ? editing : null;
  const locked = !edit && ((!!item.targetMonth && item.application !== 'not_applied') || !!item.reportOnly);
  const entry = scheduleRowEntry(item);
  const meta: BulkScheduleMeta = {
    key: item.key,
    inspectionId: inspection.inspection_id,
    targetMonth: item.targetMonth || null,
    locked,
    propertyName: inspection.property_name,
    terminalIds: inspection.terminal_ids,
    ...(item.unitCode ? { unitCode: item.unitCode } : {}),
    ...(item.secondary ? { secondary: true } : {}),
    ...(item.unit?.unit_id ? { unitId: item.unit.unit_id } : {}),
    ...(item.reportOnly ? { reportOnly: true } : {}),
    ...(item.offMonth ? { offMonth: true } : {}),
    ...(edit ? { editEntryId: edit.id } : {}),
  };
  if (edit) {
    return {
      meta,
      row: {
        propertyCode: inspection.property_code,
        inspectionType: inspection.inspection_type_label ?? '',
        ...editRowInput(edit),
      },
    };
  }
  return {
    meta,
    row: {
      propertyCode: inspection.property_code,
      terminalId: entry?.terminal_id ?? inspection.terminal_ids[0] ?? '',
      inspectionType: inspection.inspection_type_label ?? '',
      startDate: entry?.inspection_start ?? '',
      endDate: entry?.inspection_end ?? '',
      remarks: entry?.remarks ?? '',
      memo: entry ? (memos?.get(entry.id) ?? '') : '',
    },
  };
}

/**
 * 入力済みで申請していない行（ログアウト・保守会社の切り替え・ページ離脱の確認に使う）。
 * 予定の行は点検開始日・備考・メモ・詳細設定の連絡先・追加の貼紙を入れたものだけ（予定の行は自動保存されないので、離れると消える）
 */
export function hasUnsentInput(
  row: Pick<BulkEntryRow, 'schedule' | 'startDate' | 'remarks' | 'memo' | 'posterType' | 'emergencyContact'> &
    Partial<Pick<BulkEntryRow, 'extraPosters'>>,
): boolean {
  if (!row.schedule) return true;
  if (row.schedule.locked) return false;
  return !!(
    row.startDate ||
    row.remarks ||
    row.memo ||
    row.posterType === 'custom' ||
    row.emergencyContact ||
    (row.extraPosters?.length ?? 0) > 0
  );
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
