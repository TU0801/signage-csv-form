import {
  diffUnitInspections,
  saveInspectionsToBiz,
  saveUnitInspectionsToBiz,
  unitManagedTypeIds,
} from '@/lib/api/inspections';
import { syncBuildingVendorsFromEquipment } from '@/lib/api/relationships';
import type { DbProfile, Terminal } from '@/types/database';
import type { PropertyInspection, PropertyUnit, UnitInspection, UnitInspectionTypeOption } from '@/types/app';

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

/**
 * 一覧の補足列：設備の数・台の数・担当している保守会社（設備情報と台ごとの保守から、出てきた順）。
 * 設備の数は編集モーダルの「設備情報」の表と揃える（台ごとに管理している種別の集計行は数えない）
 */
export function propertyListSummary(
  p: { inspections?: PropertyInspection[]; units?: PropertyUnit[] },
  unitTypeOptions: UnitInspectionTypeOption[] = [],
): {
  equipmentCount: number;
  unitCount: number;
  vendorIds: string[];
} {
  const inspections = p.inspections ?? [];
  const units = p.units ?? [];
  const managed = unitManagedTypeIds(units, unitTypeOptions);
  const equipment = inspections.filter((i) => !managed.has(i.inspection_type_id));
  const ids = [
    ...inspections.map((i) => i.vendor_id),
    ...units.flatMap((u) => u.inspections.map((i) => i.vendor_id)),
  ].filter((id): id is string => !!id);
  return { equipmentCount: equipment.length, unitCount: units.length, vendorIds: [...new Set(ids)] };
}

/** 保守会社の欄（先頭2社、3社目からは「他n社」） */
export function vendorSummary(names: string[]): string {
  if (names.length === 0) return '-';
  const head = names.slice(0, 2).join('、');
  return names.length > 2 ? `${head} 他${names.length - 2}社` : head;
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

/** 台ごとの保守の保存前の確認。問題があればその文言を返す。**物件の保存より前に呼ぶ** */
// v1: js/admin-masters.js validatePropertyUnitInspections
export function validateUnitInspections(units: PropertyUnit[]): string | null {
  for (const unit of units) {
    const ids = unit.inspections.map((i) => i.inspection_type_id);
    if (ids.some((id) => !id)) {
      return '台ごとの保守に、点検種別を選んでいない行があります（選ぶか、行を外してください）';
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
  profile: Pick<DbProfile, 'id'> | null;
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
    await saveInspectionsToBiz(p.propertyCode, p.inspections, p.managedTypeIds);
  } catch (e) {
    console.error('Failed to save inspections to biz:', e);
    errors.push(`点検情報の保存に失敗しました: ${errorText(e)}`);
  }

  // 台ごとの保守は、開いたときとの差分だけを送る（変えていなければ何も送らない）
  try {
    const result = await saveUnitInspectionsToBiz(diffUnitInspections(p.originalUnits, p.units));
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
    const unitInspections = p.units.flatMap((u) => u.inspections);
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
