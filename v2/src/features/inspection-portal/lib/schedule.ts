import type { DbInspectionReport, PortalEntryRow, PortalInspectionRow, ReportStatus } from '@/types/portal';

/*
 * 点検ポータルの「予定」（点検行 × 対象月）と、その申請・報告書の状況を組み立てる。
 * 点検月（inspection_months）は「毎年この月」の意味しか持たず年が無いので、
 * 点検行を登録した月（schedule_from）から数え始める。月の境界は日本時間。
 */

/** 日本時間の今日（YYYY-MM-DD）。todayUtc（v1 互換・UTC）は月末・月初の判定を誤るので使わない */
export function todayJst(now: Date = new Date()): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Tokyo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(now);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? '';
  return `${get('year')}-${get('month')}-${get('day')}`;
}

/** YYYY-MM-DD / YYYY-MM-01 → YYYY-MM-01 */
export function monthOf(date: string): string {
  return `${date.slice(0, 7)}-01`;
}

/** 月の加算（YYYY-MM-01 同士） */
export function addMonths(month: string, n: number): string {
  const y = Number(month.slice(0, 4));
  const m = Number(month.slice(5, 7)) - 1 + n;
  const yy = y + Math.floor(m / 12);
  const mm = ((m % 12) + 12) % 12;
  return `${yy}-${String(mm + 1).padStart(2, '0')}-01`;
}

/** 2026-11-01 → 2026年11月 */
export function formatMonth(month: string): string {
  return `${month.slice(0, 4)}年${Number(month.slice(5, 7))}月`;
}

/** 申請の状況。approved: 承認済み（取込済みを含む）／applied: 申請済み（承認待ち）／sent_back: 差戻し／not_applied: 未申請 */
export type ApplicationState = 'approved' | 'applied' | 'sent_back' | 'not_applied';

/** 時期。overdue: 点検月を過ぎた／current: 今月／upcoming: これから */
export type Timing = 'overdue' | 'current' | 'upcoming';

export interface ScheduleItem {
  key: string;
  inspection: PortalInspectionRow;
  /** 対象月（YYYY-MM-01） */
  targetMonth: string;
  timing: Timing;
  application: ApplicationState;
  /** 点検月を過ぎたのに申請（承認待ち・承認済み）が無い */
  overdueUnapplied: boolean;
  /** この予定に紐付いた申請（新しい順） */
  entries: PortalEntryRow[];
  /** この予定の最新の報告書（置き換え済み・削除済みを除く） */
  report: DbInspectionReport | null;
}

/** 申請として数える状態（承認待ち・承認済み・取込済み）。pending は未申請（差戻しを含む） */
const APPLIED_STATUSES = new Set<PortalEntryRow['status']>(['draft', 'ready', 'exported']);

/** 物件コードの書式の揺れ（旧来の申請は 120410、マスタは 120410-00）を吸収する */
export function normalizePropertyCode(code: string): string {
  return code.trim().replace(/-00$/, '');
}

/** 申請がこの予定（点検行 × 対象月）のものか。点検ポータルから出したものは ID、旧来のものは物件・点検種別・点検開始日の月 */
export function entryMatches(entry: PortalEntryRow, inspection: PortalInspectionRow, targetMonth: string): boolean {
  if (entry.property_inspection_id) {
    return entry.property_inspection_id === inspection.inspection_id && entry.target_month === targetMonth;
  }
  if (!entry.inspection_start) return false;
  return (
    normalizePropertyCode(entry.property_code) === normalizePropertyCode(inspection.property_code) &&
    entry.inspection_type === (inspection.inspection_type_label ?? '') &&
    monthOf(entry.inspection_start) === targetMonth
  );
}

export function applicationState(entries: PortalEntryRow[]): ApplicationState {
  if (entries.some((e) => e.status === 'ready' || e.status === 'exported')) return 'approved';
  if (entries.some((e) => e.status === 'draft')) return 'applied';
  if (entries.some((e) => e.status === 'pending' && e.review_comment)) return 'sent_back';
  return 'not_applied';
}

const LIVE_REPORT_STATUSES = new Set<ReportStatus>(['submitted', 'accepted', 'returned']);

export function latestReport(
  reports: DbInspectionReport[],
  inspectionId: string,
  targetMonth: string,
): DbInspectionReport | null {
  const live = reports
    .filter(
      (r) =>
        r.property_inspection_id === inspectionId &&
        r.target_month === targetMonth &&
        LIVE_REPORT_STATUSES.has(r.status),
    )
    .sort((a, b) => b.created_at.localeCompare(a.created_at));
  return live[0] ?? null;
}

export interface BuildScheduleOptions {
  today: string;
  /** 今月から何か月先まで出すか（既定 3） */
  monthsAhead?: number;
}

/**
 * 予定を組み立てる。点検月がある点検行だけが対象（点検月の無い点検行は unscheduledInspections で別に出す）。
 * 過去の月は、点検行の登録月（schedule_from）から今月の前月まで全部を出す（超過を見落とさないため）。
 */
export function buildSchedule(
  inspections: PortalInspectionRow[],
  entries: PortalEntryRow[],
  reports: DbInspectionReport[],
  { today, monthsAhead = 3 }: BuildScheduleOptions,
): ScheduleItem[] {
  const currentMonth = monthOf(today);
  const lastMonth = addMonths(currentMonth, monthsAhead);
  const items: ScheduleItem[] = [];
  for (const inspection of inspections) {
    const months = new Set(inspection.inspection_months);
    if (months.size === 0) continue;
    for (let m = monthOf(inspection.schedule_from); m <= lastMonth; m = addMonths(m, 1)) {
      if (!months.has(Number(m.slice(5, 7)))) continue;
      const matched = entries
        .filter((e) => entryMatches(e, inspection, m))
        .sort((a, b) => b.created_at.localeCompare(a.created_at));
      const timing: Timing = m < currentMonth ? 'overdue' : m === currentMonth ? 'current' : 'upcoming';
      const application = applicationState(matched);
      items.push({
        key: `${inspection.inspection_id}:${m}`,
        inspection,
        targetMonth: m,
        timing,
        application,
        overdueUnapplied: timing === 'overdue' && !matched.some((e) => APPLIED_STATUSES.has(e.status)),
        entries: matched,
        report: latestReport(reports, inspection.inspection_id, m),
      });
    }
  }
  return items.sort(
    (a, b) =>
      a.targetMonth.localeCompare(b.targetMonth) ||
      a.inspection.property_code.localeCompare(b.inspection.property_code) ||
      (a.inspection.inspection_type_label ?? '').localeCompare(b.inspection.inspection_type_label ?? ''),
  );
}

/** 点検月が登録されていない点検行（超過の判定ができない。申請は月を選んでできる） */
export function unscheduledInspections(inspections: PortalInspectionRow[]): PortalInspectionRow[] {
  return inspections.filter((i) => i.inspection_months.length === 0);
}

export interface ScheduleCounts {
  /** 点検月を過ぎて未申請 */
  overdueUnapplied: number;
  /** 承認待ち（申請済み） */
  awaitingApproval: number;
  /** 差戻し中 */
  sentBack: number;
  /** 報告書の確認待ち */
  reportsAwaitingReview: number;
  /** 報告書の差戻し */
  reportsReturned: number;
}

export function countSchedule(items: ScheduleItem[]): ScheduleCounts {
  return {
    overdueUnapplied: items.filter((i) => i.overdueUnapplied).length,
    awaitingApproval: items.filter((i) => i.application === 'applied').length,
    sentBack: items.filter((i) => i.application === 'sent_back').length,
    reportsAwaitingReview: items.filter((i) => i.report?.status === 'submitted').length,
    reportsReturned: items.filter((i) => i.report?.status === 'returned').length,
  };
}
