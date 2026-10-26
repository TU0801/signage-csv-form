import type { DbInspectionReport, PortalEntryRow, PortalInspectionRow } from '@/types/portal';
import {
  applicationState,
  buildSchedule,
  entryMatches,
  latestReport,
  monthOf,
  unscheduledInspections,
  type InspectionTypeFlags,
  type ScheduleItem,
} from './schedule';
import { expandByUnits, type NotifyOffIndex, type UnitIndex } from './units';

/*
 * 報告書の確認（点検登録フォームの3つ目のタブ。修正依頼1027）。
 * 申請不要（点検種別の報告書のみ・点検日連絡 OFF）の点検の、物件 × 点検種別 × 対象月ごとの報告書の届き具合。
 * 報告書の判定は予定と同じ latestReport（点検行 × 対象月の submitted / accepted / returned の最新）。
 * 台ごとの点検も報告書は点検行の単位（報告書UP は No1 だけ）なので、点検ごとに1行にまとめる。
 */

export interface ReportCheckOptions {
  today: string;
  flags?: ReadonlyMap<string, InspectionTypeFlags>;
  unitIndex: UnitIndex;
  /** 台を絞る保守会社（保守会社のアカウントは自社。管理者は null = 全部の台） */
  unitVendorId: string | null;
  notify?: NotifyOffIndex;
}

/** 点検月の無い点検の、報告書が届いた月の行（点検月が無いので未着の月は決められない） */
function unscheduledReportItems(
  inspections: PortalInspectionRow[],
  entries: PortalEntryRow[],
  reports: DbInspectionReport[],
  { today, flags }: Pick<ReportCheckOptions, 'today' | 'flags'>,
): ScheduleItem[] {
  const currentMonth = monthOf(today);
  const items: ScheduleItem[] = [];
  for (const inspection of unscheduledInspections(inspections, flags)) {
    const months = new Set(
      reports.filter((r) => r.property_inspection_id === inspection.inspection_id && r.target_month).map((r) => r.target_month!),
    );
    for (const m of months) {
      const report = latestReport(reports, inspection.inspection_id, m);
      if (!report) continue;
      const matched = entries.filter((e) => entryMatches(e, inspection, m));
      items.push({
        key: `${inspection.inspection_id}:${m}`,
        inspection,
        targetMonth: m,
        timing: m < currentMonth ? 'overdue' : m === currentMonth ? 'current' : 'upcoming',
        application: applicationState(matched),
        overdueUnapplied: false,
        entries: matched,
        report,
        ...(flags?.get(inspection.inspection_type_id)?.reportOnly ? { reportOnly: true } : {}),
      });
    }
  }
  return items;
}

/** 報告書確認の1行。代表は1台目の行。unitRows はまとめた台の行すべて（完了連絡の有無はどの台のものでも出す） */
export type ReportCheckItem = ScheduleItem & { unitRows: ScheduleItem[] };

/**
 * 申請不要の点検の行（点検行 × 対象月。今月まで）。台ごとの点検はどれかの台が申請不要なら申請不要として1行（1台目の行）にする
 */
export function buildReportCheckItems(
  inspections: PortalInspectionRow[],
  entries: PortalEntryRow[],
  reports: DbInspectionReport[],
  { today, flags, unitIndex, unitVendorId, notify }: ReportCheckOptions,
): ReportCheckItem[] {
  const scheduled = buildSchedule(inspections, entries, reports, { today, monthsAhead: 0, flags });
  const unscheduled = unscheduledReportItems(inspections, entries, reports, { today, flags });
  const expanded = expandByUnits([...scheduled, ...unscheduled], unitIndex, unitVendorId, { notify });
  // 点検行 × 対象月ごとにまとめる（1台目の行を代表にする）
  const groups = new Map<string, { first: ScheduleItem; rows: ScheduleItem[]; reportOnly: boolean }>();
  for (const item of expanded) {
    const key = `${item.inspection.inspection_id}:${item.targetMonth}`;
    const g = groups.get(key);
    if (g) {
      g.rows.push(item);
      g.reportOnly ||= !!item.reportOnly;
    } else groups.set(key, { first: item, rows: [item], reportOnly: !!item.reportOnly });
  }
  return [...groups.values()]
    .filter((g) => g.reportOnly)
    .map(({ first, rows }) => ({
      ...first,
      key: `${first.inspection.inspection_id}:${first.targetMonth}`,
      reportOnly: true,
      unitRows: rows,
    }))
    .sort(
      (a, b) =>
        a.inspection.property_code.localeCompare(b.inspection.property_code) ||
        (a.inspection.inspection_type_label ?? '').localeCompare(b.inspection.inspection_type_label ?? ''),
    );
}

/** 報告書の状態の短い表示（提出・受領・差戻し） */
export const REPORT_STATE_LABEL: Record<'submitted' | 'accepted' | 'returned', string> = {
  submitted: '提出',
  accepted: '受領',
  returned: '差戻し',
};
