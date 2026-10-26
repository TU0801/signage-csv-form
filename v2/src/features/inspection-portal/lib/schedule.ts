import type {
  DbInspectionReport,
  InspectionTypeFlagRow,
  PortalEntryRow,
  PortalInspectionRow,
  PortalUnitRow,
  ReportStatus,
} from '@/types/portal';

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

/** 2026-11-13 → 2026/11/13（新しい画面の日付の書き方。月は formatMonth） */
export function formatDate(date: string | null | undefined): string {
  if (!date) return '';
  return date.slice(0, 10).replace(/-/g, '/');
}

/** 2026-11-01 → 2026年11月 */
export function formatMonth(month: string): string {
  return `${month.slice(0, 4)}年${Number(month.slice(5, 7))}月`;
}

/** 1〜12 月（毎月の点検種別の点検月） */
const EVERY_MONTH = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];

/**
 * 点検月の表示（修正依頼1027）。毎月の点検種別か 1〜12 月がそろう点検は「毎月」（印が無くても）。
 * それ以外は上の段に奇数月・下の段に偶数月（改行で区切る。片方が空なら1段）。月の並びは登録の順のまま。
 * 表示だけに使う（CSV・予定の組み立ては inspection_months をそのまま使う）
 */
export function formatInspectionMonths(months: readonly number[], monthly = false): string {
  const unique = [...new Set(months.map(Number))];
  if (monthly || EVERY_MONTH.every((m) => unique.includes(m))) return '毎月';
  const odd = unique.filter((m) => m % 2 === 1);
  const even = unique.filter((m) => m % 2 === 0);
  return [odd, even]
    .filter((line) => line.length > 0)
    .map((line) => line.join(','))
    .join('\n');
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
  /** 申請不要（報告書のみ）の点検種別（修正依頼1025 H4/G4）。申請の欄を出さず、超過にしない */
  reportOnly?: boolean;
  /** 点検月『毎月』の点検種別。毎月の行を出し、超過にしない */
  monthly?: boolean;
  /** 点検月以外の月の行（「全ての月」で出す。D5）。超過にしない */
  offMonth?: boolean;
  /** 物件の下に出す設備会社固有の No（台の unit_code、台が無ければ点検行の設備会社固有コード。H2） */
  unitCode?: string | null;
  /** 台ごとに分けた行の台（H1。台が2台以上の点検だけ） */
  unit?: PortalUnitRow;
  /** 2台目以降の行（修正依頼1026 I7: 申請・完了連絡は台ごと、報告書UP は1台目の行だけ） */
  secondary?: boolean;
}

/** 点検種別の印（signage_inspection_type_flags） */
export interface InspectionTypeFlags {
  reportOnly: boolean;
  monthly: boolean;
}

/** 点検種別 ID → 印。行が無い点検種別は印なし */
export function typeFlagsMap(rows: InspectionTypeFlagRow[]): Map<string, InspectionTypeFlags> {
  return new Map(rows.map((r) => [r.inspection_type_id, { reportOnly: !!r.report_only, monthly: !!r.monthly }]));
}

/** 予定を作る点検月。毎月の点検種別は 1〜12 */
export function scheduleMonths(
  inspection: Pick<PortalInspectionRow, 'inspection_type_id' | 'inspection_months'>,
  flags?: ReadonlyMap<string, InspectionTypeFlags>,
): number[] {
  return flags?.get(inspection.inspection_type_id)?.monthly ? EVERY_MONTH : inspection.inspection_months;
}

/** 申請として数える状態（承認待ち・承認済み・取込済み）。pending は未申請（差戻しを含む） */
const APPLIED_STATUSES = new Set<PortalEntryRow['status']>(['draft', 'ready', 'exported']);

/** 申請（承認待ち・承認済み・取込済み）があるか（点検月超過の判定） */
export function hasAppliedEntry(entries: PortalEntryRow[]): boolean {
  return entries.some((e) => APPLIED_STATUSES.has(e.status));
}

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

/**
 * 状態と操作の対象にする申請（entries は新しい順）。まだ片付いていないもの（承認待ち → 差戻し）を、
 * 承認済みより先に選ぶ。承認済みを先にすると、過去に承認済みの申請がある点検で新しい申請が隠れ、
 * 管理会社に承認ボタンが出ず、保守会社にも再申請ボタンが出なくなる
 */
export function focusEntry(entries: PortalEntryRow[]): PortalEntryRow | null {
  return (
    entries.find((e) => e.status === 'draft') ??
    entries.find((e) => e.status === 'pending' && e.review_comment) ??
    entries.find((e) => e.status === 'ready' || e.status === 'exported') ??
    entries[0] ??
    null
  );
}

export function applicationState(entries: PortalEntryRow[]): ApplicationState {
  const e = focusEntry(entries);
  if (!e) return 'not_applied';
  if (e.status === 'draft') return 'applied';
  if (e.status === 'pending') return e.review_comment ? 'sent_back' : 'not_applied';
  return 'approved';
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
  /** 点検種別の印（申請不要・毎月。修正依頼1025 H4/G4） */
  flags?: ReadonlyMap<string, InspectionTypeFlags>;
  /**
   * 点検月以外の月の行も出す（D5「全ての月」）。点検月以外の月は今月以降だけ。
   * 点検月以外の訪問の申請（対象月はその月）ができる。超過にはしない。
   * 申請か報告書がある点検月以外の月は、この指定に関係なく出す
   */
  allMonths?: boolean;
}

/**
 * 予定を組み立てる。点検月がある点検行だけが対象（点検月の無い点検行は unscheduledInspections で別に出す）。
 * 過去の月は、点検行の登録月（schedule_from）から今月の前月まで全部を出す（超過を見落とさないため）。
 * 毎月の点検種別は点検月を 1〜12 とみなす。申請不要・毎月の点検種別と点検月以外の月の行は超過にしない
 */
export function buildSchedule(
  inspections: PortalInspectionRow[],
  entries: PortalEntryRow[],
  reports: DbInspectionReport[],
  { today, monthsAhead = 3, flags, allMonths = false }: BuildScheduleOptions,
): ScheduleItem[] {
  const currentMonth = monthOf(today);
  const lastMonth = addMonths(currentMonth, monthsAhead);
  const items: ScheduleItem[] = [];
  for (const inspection of inspections) {
    const months = new Set(scheduleMonths(inspection, flags));
    if (months.size === 0) continue;
    const flag = flags?.get(inspection.inspection_type_id);
    for (let m = monthOf(inspection.schedule_from); m <= lastMonth; m = addMonths(m, 1)) {
      const offMonth = !months.has(Number(m.slice(5, 7)));
      const matched = entries
        .filter((e) => entryMatches(e, inspection, m))
        .sort((a, b) => b.created_at.localeCompare(a.created_at));
      const report = latestReport(reports, inspection.inspection_id, m);
      // 点検月以外の月は、申請か報告書がある月は常に出す（「点検月のみ」や点検一覧・報告書一括アップロードでも、
      // 「全ての月」で出した申請・報告書が消えないように）。それ以外は「全ての月」の今月以降だけ
      // （過去の月まで出すと、申請の無い過去の月が全部並ぶ）
      if (offMonth && matched.length === 0 && !report && (!allMonths || m < currentMonth)) continue;
      const timing: Timing = m < currentMonth ? 'overdue' : m === currentMonth ? 'current' : 'upcoming';
      const application = applicationState(matched);
      const noOverdue = offMonth || !!flag?.reportOnly || !!flag?.monthly;
      items.push({
        key: `${inspection.inspection_id}:${m}`,
        inspection,
        targetMonth: m,
        timing,
        application,
        overdueUnapplied: !noOverdue && timing === 'overdue' && !hasAppliedEntry(matched),
        entries: matched,
        report,
        ...(flag?.reportOnly ? { reportOnly: true } : {}),
        ...(flag?.monthly ? { monthly: true } : {}),
        ...(offMonth ? { offMonth: true } : {}),
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

/** 点検月が登録されていない点検行（超過の判定ができない。申請は月を選んでできる）。毎月の点検種別は予定に出すので除く */
export function unscheduledInspections(
  inspections: PortalInspectionRow[],
  flags?: ReadonlyMap<string, InspectionTypeFlags>,
): PortalInspectionRow[] {
  return inspections.filter((i) => scheduleMonths(i, flags).length === 0);
}
