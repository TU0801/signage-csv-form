import { supabase } from '@/lib/supabase';
import { inspectionRpc } from './scopedRpc';
import type {
  PropertyInspection,
  PropertyUnit,
  UnitInspection,
  UnitInspectionTypeOption,
} from '@/types/app';
import type { RpcPropertyInspectionRow } from '@/types/rpc';

// ========================================
// 物件×点検種別（正本は biz.property_inspections。2026-09-19 切り替え）
// ========================================

// v1: js/supabase/relationships.js saveInspectionsToBiz（inspections_for_property の呼び出し）
export async function fetchInspectionsForProperty(
  propertyCode: string,
  /** 管理会社は自社物件だけを扱う mgmt_* を使う */
  role?: string | null,
): Promise<RpcPropertyInspectionRow[]> {
  const { data, error } = await supabase.rpc(inspectionRpc(role).inspectionsForProperty, {
    p_property_code: String(propertyCode),
  });
  if (error) throw error;
  return (data ?? []) as RpcPropertyInspectionRow[];
}

/**
 * 物件の点検情報を業務システム（biz）へ保存する。signage 側の jsonb には書かない（凍結済み）。
 * 「今ある一覧」と「送られた一覧」を突き合わせ、画面から消えた点検は biz からも消す。
 * 台ごとに管理している点検種別（skipTypeIds）は消しも送りもしない（saveUnitInspectionsToBiz が送る）。
 */
// v1: js/supabase/relationships.js saveInspectionsToBiz
export async function saveInspectionsToBiz(
  propertyCode: string,
  inspections: PropertyInspection[],
  skipTypeIds: Set<string> = new Set(),
  role?: string | null,
): Promise<{ saved: number }> {
  const rpcNames = inspectionRpc(role);
  const list = (Array.isArray(inspections) ? inspections : []).filter(
    (e) => !(e && skipTypeIds.has(e.inspection_type_id)),
  );

  const current = await fetchInspectionsForProperty(propertyCode, role);

  const wantIds = new Set(list.map((e) => e?.inspection_type_id).filter(Boolean));
  // 画面から消えた点検を削除する。残すと消したはずの案内が出続ける
  for (const row of current) {
    if (skipTypeIds.has(row.inspection_type_id)) continue;
    if (!wantIds.has(row.inspection_type_id)) {
      const { error } = await supabase.rpc(rpcNames.deletePropertyInspection, { p_id: row.id });
      if (error) throw error;
    }
  }

  // 保守会社用の設備コードは業務システム側で入力する。null を送ると RPC の on conflict で消えるので今の値を引き継ぐ
  const currentCode = new Map(current.map((r) => [r.inspection_type_id, r.maintainer_equipment_code]));

  for (const e of list) {
    if (!e?.inspection_type_id) continue;
    const months = Array.isArray(e.inspection_months)
      ? e.inspection_months.map(Number).filter((n) => n >= 1 && n <= 12)
      : [];
    const { error } = await supabase.rpc(rpcNames.upsertPropertyInspection, {
      p_property_code: String(propertyCode),
      p_inspection_type_id: e.inspection_type_id,
      p_maintainer_id: e.vendor_id || null,
      p_inspection_months: months,
      p_maintainer_equipment_code:
        e.maintainer_equipment_code ?? currentCode.get(e.inspection_type_id) ?? null,
      p_remarks: e.remarks || null,
      p_remarks2: e.remarks2 || null,
    });
    if (error) throw error;
  }
  return { saved: list.length };
}

// ========================================
// 台ごとの保守（業務システムで台を登録した大分類。2026-10-14）
// ========================================

/**
 * その物件で「台ごとに管理している点検種別」の id の集合。
 * 台がある大分類に属する点検種別（typeOptions から）と、台に既に付いている点検種別
 * （無効にした種別は typeOptions に出ないので台の側からも拾う）。
 */
// v1: js/supabase/relationships.js unitManagedTypeIds
export function unitManagedTypeIds(
  units: PropertyUnit[],
  typeOptions: UnitInspectionTypeOption[],
): Set<string> {
  const list = Array.isArray(units) ? units : [];
  const categories = new Set(list.map((u) => u.category_code));
  const ids = new Set<string>();
  (typeOptions || []).forEach((t) => {
    if (categories.has(t.category_code)) ids.add(t.inspection_type_id);
  });
  list.forEach((u) =>
    (u.inspections || []).forEach((i) => {
      if (i.inspection_type_id) ids.add(i.inspection_type_id);
    }),
  );
  return ids;
}

// 点検月を重複なしの昇順にする（DB もこの形で持つ。並びや重複の違いを「変更あり」にしない）
function normalizeMonths(months: unknown): number[] {
  const list = Array.isArray(months) ? months.map(Number).filter((n) => n >= 1 && n <= 12) : [];
  return [...new Set(list)].sort((a, b) => a - b);
}

// 検査月を YYYY-MM にそろえる（DB は月初の日付 YYYY-MM-01、画面の入力欄は YYYY-MM）
function normalizeInspectedMonth(value: string | null | undefined): string {
  return value ? String(value).slice(0, 7) : '';
}

export interface UnitInspectionUpsert {
  unit_id: string;
  inspection_type_id: string;
  vendor_id: string | null;
  inspection_months: number[];
  /** 月初の日付（YYYY-MM-01）。RPC は date で受けるので YYYY-MM のままでは通らない */
  inspected_on: string | null;
}

export interface UnitInspectionDiff {
  upserts: UnitInspectionUpsert[];
  deletes: { inspection_id: string }[];
}

/**
 * 台ごとの保守の、開いたときの状態と編集後の状態の差分を出す。キーは 台×点検種別（DB の一意制約と同じ）。
 * 送るのは差分だけ（変えていない行に触ると、ほかの人が同時に直した値を巻き戻す）。
 */
// v1: js/supabase/relationships.js diffUnitInspections
export function diffUnitInspections(
  original: Pick<PropertyUnit, 'unit_id' | 'inspections'>[],
  edited: Pick<PropertyUnit, 'unit_id' | 'inspections'>[],
): UnitInspectionDiff {
  const before = new Map<string, UnitInspection>();
  (original || []).forEach((u) =>
    (u.inspections || []).forEach((i) => {
      before.set(`${u.unit_id}|${i.inspection_type_id}`, i);
    }),
  );

  const upserts: UnitInspectionUpsert[] = [];
  const seen = new Set<string>();
  (edited || []).forEach((u) =>
    (u.inspections || []).forEach((i) => {
      if (!i.inspection_type_id) return;
      const key = `${u.unit_id}|${i.inspection_type_id}`;
      if (seen.has(key)) return;
      seen.add(key);
      const months = normalizeMonths(i.inspection_months);
      const inspectedMonth = normalizeInspectedMonth(i.inspected_on);
      const old = before.get(key);
      if (
        old &&
        (old.vendor_id || null) === (i.vendor_id || null) &&
        normalizeMonths(old.inspection_months).join(',') === months.join(',') &&
        normalizeInspectedMonth(old.inspected_on) === inspectedMonth
      ) {
        return;
      }
      upserts.push({
        unit_id: u.unit_id,
        inspection_type_id: i.inspection_type_id,
        vendor_id: i.vendor_id || null,
        inspection_months: months,
        inspected_on: inspectedMonth ? `${inspectedMonth}-01` : null,
      });
    }),
  );

  const deletes: { inspection_id: string }[] = [];
  before.forEach((i, key) => {
    if (!seen.has(key) && i.inspection_id) deletes.push({ inspection_id: i.inspection_id });
  });
  return { upserts, deletes };
}

/** 台の保守の保存の失敗の文言。ほかの操作と重なった中断（英語の文言）だけ日本語にする */
// v1: js/supabase/relationships.js unitInspectionErrorMessage
function unitInspectionErrorMessage(error: { code?: string; message?: string }): string {
  if (error.code === '40P01' || error.code === '55P03') {
    return 'ほかの操作と重なったため保存できませんでした。もう一度お試しください';
  }
  if (error.code === '57014') {
    return '時間内に終わらなかったため保存できませんでした（ほかの操作と重なった可能性があります）。もう一度お試しください';
  }
  return error.message || String(error);
}

/**
 * 台ごとの保守の差分を業務システム（biz）へ保存する（RPC は signage の管理者だけ）。
 * 1行ずつ別々に呼ぶ（まとめると業務システムの画面からの保存と deadlock になり得る）。
 * 途中で失敗しても残りの行は続けて送り、失敗は DB の文言のまま errors に入れて返す。
 */
// v1: js/supabase/relationships.js saveUnitInspectionsToBiz
export async function saveUnitInspectionsToBiz(
  diff: UnitInspectionDiff,
  role?: string | null,
): Promise<{ saved: number; errors: string[] }> {
  const rpcNames = inspectionRpc(role);
  let saved = 0;
  const errors: string[] = [];
  const run = async (fn: string, args: Record<string, unknown>) => {
    const { error } = await supabase.rpc(fn, args);
    if (error) errors.push(unitInspectionErrorMessage(error));
    else saved += 1;
  };

  for (const d of diff.deletes || []) {
    await run(rpcNames.deleteUnitInspection, { p_id: d.inspection_id });
  }
  for (const u of diff.upserts || []) {
    await run(rpcNames.upsertUnitInspection, {
      p_unit_id: u.unit_id,
      p_inspection_type_id: u.inspection_type_id,
      p_maintainer_id: u.vendor_id,
      p_inspection_months: u.inspection_months,
      p_inspected_on: u.inspected_on,
    });
  }
  return { saved, errors };
}
