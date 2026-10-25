import type { PortalInspectionRow, PortalUnitRow } from '@/types/portal';
import type { ScheduleItem } from './schedule';

/*
 * 号機（台）ごとの予定行（修正依頼1025 H1〜H3）。
 * 台が2台以上の点検は、予定行（点検行 × 対象月）を台の数だけ出す。申請・報告書・完了連絡は今までどおり点検行 × 対象月の
 * 単位で、1台目の行（代表）だけが持つ。2台目以降の行は表示だけ（ステータスは1台目と同じ、報告書UP・完了連絡の欄は空）。
 * 物件の下には設備会社固有の No（台の unit_code。サイネージの台は端末番号）を出す。
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

/**
 * 予定行を台ごとに分ける。台が2台以上なら1台目の行（key はそのまま）と、2台目以降の行（key に台 ID を足す。secondary）。
 * 1台以下なら行はそのままで、No（台の unit_code か点検行の設備会社固有コード）だけ付ける
 */
export function expandByUnits<T extends ScheduleItem>(
  items: T[],
  index: UnitIndex,
  vendorId: string | null,
): T[] {
  const out: T[] = [];
  for (const item of items) {
    const units = unitsForVendor(index, item.inspection, vendorId);
    if (units.length <= 1) {
      const code = units[0]
        ? unitLabel(units[0], 1)
        : (index.equipmentCodes.get(item.inspection.inspection_id) ?? null);
      out.push(code ? { ...item, unitCode: code } : item);
      continue;
    }
    units.forEach((unit, i) => {
      const base = { ...item, unit, unitCode: unitLabel(unit, i + 1) };
      out.push(i === 0 ? base : { ...base, key: `${item.key}:${unit.unit_id}`, secondary: true });
    });
  }
  return out;
}
