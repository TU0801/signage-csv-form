import type {
  NotifyOffRow,
  PortalEntryRow,
  PortalInspectionRow,
  PortalUnitRow,
} from '@/types/portal';
import { applicationState, hasAppliedEntry, type ScheduleItem } from './schedule';

/*
 * 号機（台）ごとの予定行（修正依頼1025 H1〜H3 → 1026 I7）。
 * 台が2台以上の点検は、予定行（点検行 × 対象月）を台の数だけ出す。申請・完了連絡・ステータスは台ごと
 * （申請は signage_entries.property_unit_id、完了連絡は signage_inspection_completions.property_unit_id）。
 * 台なしの申請（1台以下の点検・旧来・1件入力）は点検行 × 対象月の全体の申請として全部の台に効く。
 * 報告書は点検行 × 対象月の単位のままで、報告書UP は1台目の行（代表）だけに出し、報告書の状態は全部の台に出す。
 * 物件の下には設備会社固有の No（台の unit_code。サイネージの台は端末番号）を出す。
 * 点検日連絡（業務システムの notify_inspection_date）が OFF の点検・台は申請不要（報告書のみ）として扱う（修正依頼1026）。
 */

/** 点検行 ID → 台（並び順）と、台の無い点検行の設備会社固有コード */
export interface UnitIndex {
  units: Map<string, PortalUnitRow[]>;
  equipmentCodes: Map<string, string>;
}

export function buildUnitIndex(rows: PortalUnitRow[]): UnitIndex {
  const units = new Map<string, PortalUnitRow[]>();
  const equipmentCodes = new Map<string, string>();
  for (const r of rows) {
    if (!r.unit_id) {
      if (r.equipment_code) equipmentCodes.set(r.inspection_id, r.equipment_code);
      continue;
    }
    units.set(r.inspection_id, [...(units.get(r.inspection_id) ?? []), r]);
  }
  for (const list of units.values()) {
    list.sort(
      (a, b) =>
        (a.unit_sort ?? 0) - (b.unit_sort ?? 0) ||
        (a.unit_code ?? '').localeCompare(b.unit_code ?? ''),
    );
  }
  return { units, equipmentCodes };
}

/**
 * 行に出す台。保守会社（vendorId）が決まっていれば、その会社が保守する台だけ（台の保守会社が未設定なら点検行の会社のもの）。
 * vendorId が null（管理会社など）なら全部
 */
export function unitsForVendor(
  index: UnitIndex,
  inspection: Pick<PortalInspectionRow, 'inspection_id' | 'vendor_id'>,
  vendorId: string | null,
): PortalUnitRow[] {
  const all = index.units.get(inspection.inspection_id) ?? [];
  if (!vendorId) return all;
  return all.filter((u) => (u.maintainer_id ?? inspection.vendor_id) === vendorId);
}

/** 台の No の表示。unit_code が未登録なら「n台目」（n は表に出す台の中の順番） */
export function unitLabel(unit: Pick<PortalUnitRow, 'unit_code'>, position: number): string {
  return unit.unit_code ?? `${position}台目`;
}

/** 台 ID → No の表示（点検行の全部の台の中の順番。承認画面など、申請の台から No を引くところで使う） */
export function unitLabelsById(index: UnitIndex): Map<string, string> {
  const labels = new Map<string, string>();
  for (const list of index.units.values()) {
    list.forEach((u, i) => {
      if (u.unit_id) labels.set(u.unit_id, unitLabel(u, i + 1));
    });
  }
  return labels;
}

/** 点検日連絡が OFF の点検行（台の無い点検の値）と台（`点検行 ID:台 ID`） */
export interface NotifyOffIndex {
  inspections: Set<string>;
  units: Set<string>;
}

export function buildNotifyOffIndex(rows: NotifyOffRow[]): NotifyOffIndex {
  const inspections = new Set<string>();
  const units = new Set<string>();
  for (const r of rows) {
    if (r.unit_id) units.add(`${r.inspection_id}:${r.unit_id}`);
    else inspections.add(r.inspection_id);
  }
  return { inspections, units };
}

/** 点検日連絡が OFF か。台があれば台の値（業務システムの台ごとの保守の ☑点検日連絡）、無ければ点検行の値 */
export function notifyOff(
  index: NotifyOffIndex | undefined,
  inspectionId: string,
  unitId: string | null | undefined,
): boolean {
  if (!index) return false;
  return unitId
    ? index.units.has(`${inspectionId}:${unitId}`)
    : index.inspections.has(inspectionId);
}

/** 台の申請（その台の申請と、台なしの申請） */
export function entriesForUnit(entries: PortalEntryRow[], unitId: string): PortalEntryRow[] {
  return entries.filter((e) => !e.property_unit_id || e.property_unit_id === unitId);
}

/**
 * 行の申請・申請不要・点検月超過を、台の申請と点検日連絡で決め直す。
 * 申請不要は点検種別の印（報告書のみ）か点検日連絡 OFF。点検月超過は点検月の行で、申請不要・毎月でなく、申請が無いもの
 */
function withUnitState<T extends ScheduleItem>(
  item: T,
  entries: PortalEntryRow[],
  off: boolean,
): T {
  const reportOnly = !!item.reportOnly || off;
  const noOverdue = !!item.offMonth || reportOnly || !!item.monthly || !item.targetMonth;
  const next: T = {
    ...item,
    entries,
    application: applicationState(entries),
    overdueUnapplied: !noOverdue && item.timing === 'overdue' && !hasAppliedEntry(entries),
  };
  if (reportOnly) next.reportOnly = true;
  return next;
}

export interface ExpandOptions {
  /** 点検日連絡が OFF の点検行・台（修正依頼1026）。無ければ全部 ON */
  notify?: NotifyOffIndex;
}

/**
 * 予定行を台ごとに分ける。台が2台以上なら台ごとの行（1台目の key はそのまま、2台目以降は key に台 ID を足して secondary）。
 * 各行の申請はその台の申請と台なしの申請。1台以下なら行はそのままで、No（台の unit_code か点検行の設備会社固有コード）を付ける
 */
export function expandByUnits<T extends ScheduleItem>(
  items: T[],
  index: UnitIndex,
  vendorId: string | null,
  { notify }: ExpandOptions = {},
): T[] {
  const out: T[] = [];
  for (const item of items) {
    const id = item.inspection.inspection_id;
    const all = index.units.get(id) ?? [];
    const units = unitsForVendor(index, item.inspection, vendorId);
    // 台ごとに分けるのは点検の台が2台以上のとき（保守会社に見える台が1台だけでも、ほかの台の申請と混ぜない）
    if (all.length <= 1 || units.length === 0) {
      const code = units[0] ? unitLabel(units[0], 1) : (index.equipmentCodes.get(id) ?? null);
      // 1台の点検は台の点検日連絡、台の無い点検は点検行の点検日連絡
      const off = notifyOff(notify, id, units[0]?.unit_id ?? null);
      const base = off ? withUnitState(item, item.entries, true) : item;
      out.push(code ? { ...base, unitCode: code } : base);
      continue;
    }
    units.forEach((unit, i) => {
      const unitId = unit.unit_id!;
      const base = withUnitState(
        { ...item, unit, unitCode: unitLabel(unit, all.indexOf(unit) + 1) },
        entriesForUnit(item.entries, unitId),
        notifyOff(notify, id, unitId),
      );
      out.push(i === 0 ? base : { ...base, key: `${item.key}:${unitId}`, secondary: true });
    });
  }
  return out;
}
