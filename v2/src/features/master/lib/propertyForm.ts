import {
  diffUnitInspections,
  saveInspectionsToBiz,
  saveUnitInspectionsToBiz,
  unitManagedTypeIds,
} from '@/lib/api/inspections';
import { syncBuildingVendorsFromEquipment } from '@/lib/api/relationships';
import type { DbProfile, Terminal } from '@/types/database';
import type { PropertyInspection, PropertyUnit, UnitInspection, UnitInspectionTypeOption } from '@/types/app';
import type { RpcMasterPropertyManagementCompanyRow } from '@/types/rpc';
import { scheduleKey } from '@/lib/inspectionSchedule';

/** 一覧の端末欄（先頭4台の端末ID、5台以上は「...」、末尾に台数） */
// v1: js/admin-masters.js renderProperties（terminalDisplay）
export function terminalSummary(terminals: Terminal[]): string {
  const display =
    terminals.length > 0
      ? terminals
          .map((t) => t.terminal_id)
          .filter(Boolean)
          .slice(0, 4)
          .join(', ') + (terminals.length > 4 ? '...' : '')
      : 'なし';
  return `${display} (${terminals.length}台)`;
}

/** 台の写し（編集中の値が一覧のデータを書き換えないように） */
// v1: js/admin-masters.js clonePropertyUnits
export function cloneUnits(units: PropertyUnit[] | undefined): PropertyUnit[] {
  return (Array.isArray(units) ? units : []).map((u) => ({
    ...u,
    inspections: (u.inspections || []).map((i) => ({
      ...i,
      inspection_months: Array.isArray(i.inspection_months) ? [...i.inspection_months] : [],
      ...(Array.isArray(i.billing_months) ? { billing_months: [...i.billing_months] } : {}),
    })),
  }));
}

/** 設備情報の比較用の形（並び・空の値の違いだけで「変更あり」にしない） */
function inspectionKey(rows: PropertyInspection[]): string {
  return JSON.stringify(
    rows.map((r) => [
      r.inspection_type_id,
      r.vendor_id || null,
      [...(r.inspection_months ?? [])].map(Number).sort((a, b) => a - b),
      r.remarks ?? '',
      r.remarks2 ?? '',
      r.inspected_on ? String(r.inspected_on).slice(0, 7) : '',
      scheduleKey(r),
    ]),
  );
}

/** 設備情報が開いたときから変わったか（閉じる前の破棄確認に使う） */
export function inspectionsChanged(before: PropertyInspection[], after: PropertyInspection[]): boolean {
  return inspectionKey(before) !== inspectionKey(after);
}

/** 台ごとの保守が開いたときから変わったか。どちらも cloneUnits で作るので、触っていなければ同じ形になる */
export function unitsChanged(before: PropertyUnit[], after: PropertyUnit[]): boolean {
  return JSON.stringify(before) !== JSON.stringify(after);
}

/** 一覧の設備の1行（保守会社の列に1行ずつ並べる） */
export interface EquipmentRow {
  key: string;
  inspectionTypeId: string;
  /** 台ごとの保守の行は点検種別名を持つ。物件単位の点検は undefined（呼ぶ側が点検種別マスターから引く） */
  inspectionTypeLabel?: string;
  /** 台ごとの保守の行は台の No（業務システムの台コード。無ければ同じ大分類の中の並びで No1…）。物件単位の点検は null */
  unitLabel: string | null;
  vendorId: string | null;
}

/**
 * 一覧の補足列：設備の行・設備の数・台の数（修正依頼1025 E2）。
 * 設備は「点検行。ただし台ごとに管理している種別は台ごとの保守の行で展開」で数える
 * （台ごとに管理している種別の集計行は数えない。保守の無い台は行にしない）。保守会社の列はこの行の数だけ並ぶ（同じ保守会社でも重ねない）
 */
export function propertyListSummary(
  p: { inspections?: PropertyInspection[]; units?: PropertyUnit[] },
  unitTypeOptions: UnitInspectionTypeOption[] = [],
): {
  equipment: EquipmentRow[];
  equipmentCount: number;
  unitCount: number;
} {
  const inspections = p.inspections ?? [];
  const units = p.units ?? [];
  const managed = unitManagedTypeIds(units, unitTypeOptions);
  const equipment: EquipmentRow[] = inspections
    .filter((i) => !managed.has(i.inspection_type_id))
    .map((i, idx) => ({
      key: `p${idx}`,
      inspectionTypeId: i.inspection_type_id,
      unitLabel: null,
      vendorId: i.vendor_id || null,
    }));
  const seqByCategory = new Map<string, number>();
  units.forEach((u, uIdx) => {
    const seq = (seqByCategory.get(u.category_code) ?? 0) + 1;
    seqByCategory.set(u.category_code, seq);
    const label = u.unit_code?.trim() || `No${seq}`;
    (u.inspections ?? []).forEach((i, iIdx) =>
      equipment.push({
        key: `u${uIdx}-${iIdx}`,
        inspectionTypeId: i.inspection_type_id,
        inspectionTypeLabel: i.inspection_type_label || undefined,
        unitLabel: label,
        vendorId: i.vendor_id || null,
      }),
    );
  });
  return { equipment, equipmentCount: equipment.length, unitCount: units.length };
}

/** 物件の管理会社（一覧の列と絞り込み。1025 E1）。label は略称、無ければ正式名 */
export interface PropertyManagementCompany {
  id: string;
  label: string;
  name: string;
}

/** RPC master_property_management_companies の行を 物件コード → 管理会社 にする（未設定の物件は入れない） */
export function managementCompanyMap(
  rows: RpcMasterPropertyManagementCompanyRow[],
): Map<string, PropertyManagementCompany> {
  const map = new Map<string, PropertyManagementCompany>();
  rows.forEach((r) => {
    if (!r.management_company_id) return;
    const name = r.management_company_name ?? '';
    map.set(r.property_code, {
      id: r.management_company_id,
      name,
      label: r.management_company_short_name || name || '（名前なし）',
    });
  });
  return map;
}

/** 台に新しく足す保守の行（点検種別は未選択） */
// v1: js/admin-masters.js renderPropertyUnitInspections（unit-add-btn）
export function newUnitInspection(): UnitInspection {
  return {
    inspection_type_id: '',
    inspection_type_label: '',
    vendor_id: null,
    vendor_name: '',
    inspection_months: [],
    inspected_on: null,
    legacy_remarks: '',
    legacy_remarks2: '',
  };
}

/**
 * 未保存の行に何も入っていないか（点検種別・保守会社・点検月・検査月・点検日連絡・インターバル・請求月のどれも触っていない）。
 * 保守の無い台に出す行を触っていない状態。点検日連絡・インターバルは既定を画面に出すだけで、触るまでは undefined
 */
export function isBlankUnitInspection(i: UnitInspection): boolean {
  return (
    !i.inspection_id &&
    !i.inspection_type_id &&
    !i.vendor_id &&
    (i.inspection_months ?? []).length === 0 &&
    !i.inspected_on &&
    i.notify_inspection_date === undefined &&
    i.interval_months === undefined &&
    (i.billing_months ?? []).length === 0
  );
}

/**
 * 保存で送る形にする: 「（外す）」を選んだ行（remove）と、何も入っていない未保存の行を除く。
 * 外す行を除いた台を diffUnitInspections に渡すと、開いたときにあった行が deletes に入る
 * （『外す』ボタンで行を消していたときと同じ RPC・同じ引数。2026-10-27 修正依頼1026⑥）
 */
export function unitsForSave(units: PropertyUnit[]): PropertyUnit[] {
  return units.map((u) => ({
    ...u,
    inspections: u.inspections.filter((i) => !i.remove && !isBlankUnitInspection(i)),
  }));
}

/** 台ごとの保守の保存前の確認。問題があればその文言を返す。**物件の保存より前に呼ぶ** */
// v1: js/admin-masters.js validatePropertyUnitInspections
export function validateUnitInspections(units: PropertyUnit[]): string | null {
  for (const unit of unitsForSave(units)) {
    const ids = unit.inspections.map((i) => i.inspection_type_id);
    if (ids.some((id) => !id)) {
      return '台ごとの保守に、点検種別を選んでいない行があります（点検種別を選ぶか、入れた保守会社・点検月・検査月・点検日連絡・インターバル・請求月を戻してください）';
    }
    if (new Set(ids).size !== ids.length) {
      return '台ごとの保守で、同じ台に同じ点検種別が2行あります';
    }
  }
  return null;
}

export interface SavePropertyParams {
  /** 点検情報・台ごとの保守を送る物件のコード（物件そのものは保存しない） */
  propertyCode: string;
  /** 設備情報（物件×点検種別。台ごとに管理している点検種別を外した後のもの） */
  inspections: PropertyInspection[];
  /** 台ごとに管理している点検種別の id（開いたときに決めたもの） */
  managedTypeIds: Set<string>;
  /** モーダルを開いたときの台（差分の基準） */
  originalUnits: PropertyUnit[];
  /** 編集後の台 */
  units: PropertyUnit[];
  /** role が management のときは自社物件だけを扱う管理会社用の RPC で送る */
  profile: (Pick<DbProfile, 'id'> & Partial<Pick<DbProfile, 'role'>>) | null;
}

export interface SavePropertyResult {
  /** 紐付け管理に足した保守会社の数 */
  added: number;
  /** 失敗したもの（業務システム・紐付け）の文言 */
  errors: string[];
}

/**
 * 物件モーダルの保存。点検情報・台ごとの保守を業務システム（biz）へ、保守会社を紐付け管理へ送る。
 * **物件そのもの（コード・名前・端末）は保存しない**（2026-10-15。正本は業務システムの物件で、biz のトリガーが写す）。
 * 失敗しても残りは送り、業務システムが断った理由（RPC の文言）を errors に溜めて返す（呼ぶ側が最後にまとめて出す）。
 */
// v1: js/admin-masters.js handleMasterFormSubmit（type === 'property'）
export async function savePropertyForm(p: SavePropertyParams): Promise<SavePropertyResult> {
  const errors: string[] = [];
  try {
    await saveInspectionsToBiz(p.propertyCode, p.inspections, p.managedTypeIds, p.profile?.role);
  } catch (e) {
    console.error('Failed to save inspections to biz:', e);
    errors.push(`点検情報の保存に失敗しました: ${errorText(e)}`);
  }

  // 「（外す）」を選んだ行は除いて送る（差分で deletes になる）。紐付け管理にも足さない
  const units = unitsForSave(p.units);

  // 台ごとの保守は、開いたときとの差分だけを送る（変えていなければ何も送らない）
  try {
    const result = await saveUnitInspectionsToBiz(diffUnitInspections(p.originalUnits, units), p.profile?.role);
    if (result.errors.length > 0) {
      console.error('Failed to save unit inspections to biz:', result.errors);
      errors.push(
        `台ごとの保守 ${result.errors.length} 件の保存に失敗しました: ${[...new Set(result.errors)].join(' ／ ')}`,
      );
    }
  } catch (e) {
    console.error('Failed to save unit inspections to biz:', e);
    errors.push(`台ごとの保守の保存に失敗しました: ${errorText(e)}`);
  }

  // 設備情報と台ごとの保守で選んだ保守会社を紐付け管理にも足す（0913 依頼②。追加だけで既存の紐付けは触らない）
  let added = 0;
  try {
    const unitInspections = units.flatMap((u) => u.inspections);
    const synced = await syncBuildingVendorsFromEquipment(
      p.propertyCode,
      [...p.inspections, ...unitInspections],
      p.profile,
    );
    added = synced.added;
  } catch (e) {
    console.error('Failed to sync building vendors:', e);
    errors.push('紐付け管理への反映に失敗しました');
  }

  return { added, errors };
}

function errorText(e: unknown): string {
  if (e && typeof e === 'object' && 'message' in e && (e as { message?: unknown }).message) {
    return String((e as { message: unknown }).message);
  }
  return String(e);
}
