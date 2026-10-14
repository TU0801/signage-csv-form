import { addProperty, updateProperty } from '@/lib/api/admin-masters';
import {
  diffUnitInspections,
  saveInspectionsToBiz,
  saveUnitInspectionsToBiz,
} from '@/lib/api/inspections';
import { syncBuildingVendorsFromEquipment } from '@/lib/api/relationships';
import type { DbProfile, Terminal } from '@/types/database';
import type { PropertyInspection, PropertyUnit, UnitInspection } from '@/types/app';

/**
 * 端末の入力行を保存する形にする。端末はサイネージ未設置の物件もあるので任意で、端末IDが空の行は保存しない。
 * キーは v1 と同じ terminal_id（{id} などで書くと v1 の画面から端末が見えなくなる）。
 */
// v1: js/admin-masters.js handleMasterFormSubmit（terminals の収集）
export function collectTerminals(rows: Terminal[]): Terminal[] {
  return rows
    .map((t) => ({ terminal_id: (t.terminal_id ?? '').trim(), supplement: (t.supplement ?? '').trim() }))
    .filter((t) => t.terminal_id);
}

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
  /** 編集なら物件の id、追加なら null */
  id: string | null;
  propertyCode: string;
  propertyName: string;
  terminals: Terminal[];
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
  /** 物件は保存できたが、後続（業務システム・紐付け）で失敗したものの文言 */
  errors: string[];
}

/**
 * 物件を保存し、続けて点検情報・台ごとの保守を業務システム（biz）へ、保守会社を紐付け管理へ送る。
 * **物件の保存が失敗したら throw する**（後続は送らない）。後続の失敗は物件の保存を戻さず、
 * 業務システムが断った理由（RPC の文言）を errors に溜めて返す（呼ぶ側が最後にまとめて出す）。
 */
// v1: js/admin-masters.js handleMasterFormSubmit（type === 'property'）
export async function savePropertyForm(p: SavePropertyParams): Promise<SavePropertyResult> {
  // equipment は送らない（2026-09-20 の凍結。点検情報は saveInspectionsToBiz が業務システムへ送る）
  const record = { property_code: p.propertyCode, property_name: p.propertyName, terminals: p.terminals };
  if (p.id) await updateProperty(p.id, record);
  else await addProperty(record);

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
    errors.push('紐付け管理への反映に失敗しました（物件は保存済みです）');
  }

  return { added, errors };
}

function errorText(e: unknown): string {
  if (e && typeof e === 'object' && 'message' in e && (e as { message?: unknown }).message) {
    return String((e as { message: unknown }).message);
  }
  return String(e);
}
