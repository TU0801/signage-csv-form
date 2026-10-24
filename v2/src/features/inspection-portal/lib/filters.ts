import { normalizeSearch } from '@/lib/utils';
import type { PortalInspectionRow } from '@/types/portal';
import { addMonths, monthOf, type ScheduleItem } from './schedule';
import { STATUS_LABEL, STATUS_ORDER, type InspectionStatus } from './status';

/*
 * 点検一覧の絞り込み。件数バッジを押したときもここの条件（ステータス）に置き換えて絞る。
 * 点検登録フォーム（一括入力）も時期・検索・管理会社の条件をここから使う。
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

/** ステータス（修正依頼1024 B14・B19。旧「申請状況」）。'' = すべて */
export type StatusFilter = '' | InspectionStatus;

export const STATUS_OPTIONS: { value: StatusFilter; label: string }[] = [
  { value: '', label: 'ステータス: すべて' },
  ...STATUS_ORDER.map((s) => ({ value: s, label: STATUS_LABEL[s] })),
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

export function matchTiming(item: Pick<ScheduleItem, 'timing' | 'overdueUnapplied' | 'targetMonth'>, timing: TimingFilter, today: string): boolean {
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

/** 行のステータス（完了連絡の有無を含む）が条件に合うか */
export type StatusOf = (item: ScheduleItem) => InspectionStatus;

function matchStatus(item: ScheduleItem, status: StatusFilter, statusOf: StatusOf): boolean {
  return !status || statusOf(item) === status;
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

export function filterSchedule(items: ScheduleItem[], f: PortalFilters, today: string, statusOf: StatusOf): ScheduleItem[] {
  return items.filter(
    (i) => matchTiming(i, f.timing, today) && matchStatus(i, f.status, statusOf) && matchInspection(i.inspection, f),
  );
}

/**
 * 点検月の無い点検の行（buildUnscheduledItems）の絞り込み。時期は月が無いので見ないが、
 * 「超過」はこの行には起きないので出さない。申請状況・報告書状況は予定の表と同じ条件で絞る
 */
export function filterUnscheduled<T extends ScheduleItem>(items: T[], f: PortalFilters, statusOf: StatusOf): T[] {
  if (f.timing === 'overdue') return [];
  return items.filter((i) => matchStatus(i, f.status, statusOf) && matchInspection(i.inspection, f));
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
