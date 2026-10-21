import { normalizeSearch } from '@/lib/utils';
import type { PortalInspectionRow } from '@/types/portal';
import { addMonths, monthOf, type ScheduleCounts, type ScheduleItem } from './schedule';

/*
 * 点検一覧の絞り込み。件数バッジ（countSchedule）を押したときもここの条件に置き換えて絞る。
 */

/**
 * 時期。default: 超過＋今月＋今後3か月（既定）／overdue: 超過（点検月を過ぎて未申請）／
 * current: 今月／upcoming: 今後（一覧に出す先の月まで）／all: すべて（過去の承認済みも含む）
 */
export type TimingFilter = 'default' | 'overdue' | 'current' | 'upcoming' | 'all';

export const TIMING_OPTIONS: { value: TimingFilter; label: string }[] = [
  { value: 'default', label: '超過＋今月＋今後3か月' },
  { value: 'overdue', label: '超過' },
  { value: 'current', label: '今月' },
  { value: 'upcoming', label: '今後' },
  { value: 'all', label: 'すべて' },
];

/** 既定の時期で出す先の月数 */
export const DEFAULT_MONTHS_AHEAD = 3;

/** 申請状況（申請と報告書）。件数バッジの5種もここに含む */
export type StatusFilter =
  | ''
  | 'not_applied'
  | 'applied'
  | 'approved'
  | 'sent_back'
  | 'overdue_unapplied'
  | 'report_submitted'
  | 'report_returned'
  | 'report_missing';

export const STATUS_OPTIONS: { value: StatusFilter; label: string }[] = [
  { value: '', label: '申請状況: すべて' },
  { value: 'overdue_unapplied', label: '点検月超過（未申請）' },
  { value: 'not_applied', label: '未申請' },
  { value: 'applied', label: '申請済み（承認待ち）' },
  { value: 'sent_back', label: '差戻し' },
  { value: 'approved', label: '承認済み' },
  { value: 'report_missing', label: '報告書なし' },
  { value: 'report_submitted', label: '報告書の確認待ち' },
  { value: 'report_returned', label: '報告書の差戻し' },
];

export interface PortalFilters {
  timing: TimingFilter;
  status: StatusFilter;
  search: string;
  /** 保守会社 ID（'' = すべて） */
  vendorId: string;
  /** 管理会社 ID（'' = すべて、NONE = 未設定） */
  managementCompanyId: string;
}

export const INITIAL_FILTERS: PortalFilters = {
  timing: 'default',
  status: '',
  search: '',
  vendorId: '',
  managementCompanyId: '',
};

/** 管理会社フィルターの「未設定」 */
export const NONE = '__none__';

/** 件数バッジの種類 → 押したときの申請状況 */
export const COUNT_TO_STATUS: Record<keyof ScheduleCounts, StatusFilter> = {
  overdueUnapplied: 'overdue_unapplied',
  awaitingApproval: 'applied',
  sentBack: 'sent_back',
  reportsAwaitingReview: 'report_submitted',
  reportsReturned: 'report_returned',
};

function matchTiming(item: ScheduleItem, timing: TimingFilter, today: string): boolean {
  switch (timing) {
    case 'overdue':
      return item.overdueUnapplied;
    case 'current':
      return item.timing === 'current';
    case 'upcoming':
      return item.timing === 'upcoming';
    case 'all':
      return true;
    case 'default':
      // 過去の月は「超過」だけ（承認済みの過去分まで出すと一覧が埋まる）。先は3か月まで
      if (item.timing === 'overdue') return item.overdueUnapplied;
      return item.targetMonth <= addMonths(monthOf(today), DEFAULT_MONTHS_AHEAD);
  }
}

function matchStatus(item: ScheduleItem, status: StatusFilter): boolean {
  switch (status) {
    case '':
      return true;
    case 'overdue_unapplied':
      return item.overdueUnapplied;
    case 'report_submitted':
      return item.report?.status === 'submitted';
    case 'report_returned':
      return item.report?.status === 'returned';
    case 'report_missing':
      return !item.report;
    default:
      return item.application === status;
  }
}

/** 点検行（予定と未登録の両方）に効く条件: 検索・保守会社・管理会社 */
export function matchInspection(
  inspection: PortalInspectionRow,
  f: Pick<PortalFilters, 'search' | 'vendorId' | 'managementCompanyId'>,
): boolean {
  if (f.vendorId && inspection.vendor_id !== f.vendorId && !inspection.unit_vendor_ids.includes(f.vendorId)) {
    return false;
  }
  if (f.managementCompanyId) {
    const want = f.managementCompanyId === NONE ? null : f.managementCompanyId;
    if (inspection.management_company_id !== want) return false;
  }
  const q = normalizeSearch(f.search);
  if (q) {
    const hay = normalizeSearch(`${inspection.property_code} ${inspection.property_name}`);
    if (!hay.includes(q)) return false;
  }
  return true;
}

export function filterSchedule(items: ScheduleItem[], f: PortalFilters, today: string): ScheduleItem[] {
  return items.filter(
    (i) => matchTiming(i, f.timing, today) && matchStatus(i, f.status) && matchInspection(i.inspection, f),
  );
}

/** 絞り込みの選択肢にする会社（点検行に出てくるものだけ、名前順） */
export function companyOptions(
  inspections: PortalInspectionRow[],
  pick: (i: PortalInspectionRow) => { id: string | null; name: string | null },
): { value: string; label: string }[] {
  const map = new Map<string, string>();
  inspections.forEach((i) => {
    const { id, name } = pick(i);
    if (id) map.set(id, name || '（名称なし）');
  });
  return [...map]
    .map(([value, label]) => ({ value, label }))
    .sort((a, b) => a.label.localeCompare(b.label, 'ja'));
}
