// supabase/relationships.js - Building-Vendor / Vendor-Inspection 紐付け

import { supabase } from './client.js';
import { getUser, getProfile } from './auth.js';
import { getMasterProperties } from './master-data.js';

// ========================================
// Building-Vendor Relationships
// ========================================

export async function getAssignedBuildings() {
  const profile = await getProfile();
  if (!profile) throw new Error('ログインが必要です');
  if (profile.role === 'admin') return await getMasterProperties();
  if (!profile.vendor_id) return [];

  const { data: relationships, error: relError } = await supabase
    .from('signage_building_vendors')
    .select('property_code')
    .eq('vendor_id', profile.vendor_id)
    .eq('status', 'active');
  if (relError) throw relError;
  if (!relationships || relationships.length === 0) return [];

  const propertyCodes = relationships.map(r => r.property_code);
  const { data: properties, error: propError } = await supabase
    .from('signage_master_properties')
    .select('*')
    .in('property_code', propertyCodes);
  if (propError) throw propError;
  return properties || [];
}

export async function getBuildingsByVendor(vendorId) {
  const { data: relationships, error: relError } = await supabase
    .from('signage_building_vendors')
    .select('property_code')
    .eq('vendor_id', vendorId)
    .eq('status', 'active');
  if (relError) throw relError;
  if (!relationships || relationships.length === 0) return [];

  const propertyCodes = relationships.map(r => r.property_code);
  const { data: properties, error: propError } = await supabase
    .from('signage_master_properties')
    .select('*')
    .in('property_code', propertyCodes);
  if (propError) throw propError;
  return properties || [];
}

export async function getBuildingVendors(filters = {}) {
  let query = supabase
    .from('signage_building_vendors')
    .select('*, signage_master_vendors(vendor_name, inspection_type)')
    .order('created_at', { ascending: false });
  if (filters.vendorId) query = query.eq('vendor_id', filters.vendorId);
  if (filters.status) query = query.eq('status', filters.status);
  const { data, error } = await query;
  if (error) throw error;
  return data;
}

export async function getPendingBuildingRequests() {
  const { data, error } = await supabase
    .from('signage_building_vendors')
    .select('*, signage_master_vendors(vendor_name)')
    .eq('status', 'pending')
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data;
}

export async function addBuildingVendor(propertyCode, vendorId = null) {
  const profile = await getProfile();
  if (!profile) throw new Error('ログインが必要です');
  const user = await getUser();
  const isAdminUser = profile.role === 'admin';
  const finalVendorId = vendorId || profile.vendor_id;
  if (!finalVendorId) throw new Error('ベンダーIDが設定されていません');

  // 既存レコード確認（deleted含む）
  const { data: existing } = await supabase
    .from('signage_building_vendors')
    .select('id, status')
    .eq('property_code', propertyCode)
    .eq('vendor_id', finalVendorId)
    .single();

  const newStatus = isAdminUser ? 'active' : 'pending';

  if (existing) {
    if (existing.status === 'active') {
      throw new Error('この物件は既に追加されています');
    }
    // deleted/pending → 再有効化
    const { data, error } = await supabase
      .from('signage_building_vendors')
      .update({
        status: newStatus,
        requested_by: user.id,
        approved_by: isAdminUser ? user.id : null,
        updated_at: new Date().toISOString()
      })
      .eq('id', existing.id)
      .select()
      .single();
    if (error) throw error;
    return data;
  }

  const { data, error } = await supabase
    .from('signage_building_vendors')
    .insert({
      property_code: propertyCode,
      vendor_id: finalVendorId,
      status: newStatus,
      requested_by: user.id,
      approved_by: isAdminUser ? user.id : null,
      updated_at: new Date().toISOString()
    })
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function approveBuildingRequest(buildingVendorId) {
  const user = await getUser();
  const { data, error } = await supabase
    .from('signage_building_vendors')
    .update({ status: 'active', approved_by: user.id })
    .eq('id', buildingVendorId)
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function rejectBuildingRequest(buildingVendorId) {
  const { error } = await supabase
    .from('signage_building_vendors')
    .delete()
    .eq('id', buildingVendorId);
  if (error) throw error;
}

export async function removeBuildingVendor(buildingVendorId) {
  const { data, error } = await supabase
    .from('signage_building_vendors')
    .update({ status: 'deleted' })
    .eq('id', buildingVendorId)
    .select()
    .single();
  if (error) throw error;
  return data;
}

// ========================================
// Vendor-Inspection Relationships
// ========================================

export async function getVendorInspections(vendorId) {
  const { data, error } = await supabase
    .from('signage_vendor_inspections')
    .select('*, signage_master_inspection_types(inspection_name, category)')
    .eq('vendor_id', vendorId)
    .eq('status', 'active')
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data;
}

export async function addVendorInspection(vendorId, inspectionId) {
  const { data, error } = await supabase
    .from('signage_vendor_inspections')
    .insert({ vendor_id: vendorId, inspection_id: inspectionId, status: 'active' })
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function removeVendorInspection(relationshipId) {
  const { data, error } = await supabase
    .from('signage_vendor_inspections')
    .update({ status: 'inactive' })
    .eq('id', relationshipId)
    .select()
    .single();
  if (error) throw error;
  return data;
}

/**
 * 物件マスターの設備情報から、保守会社の紐付けを作る（0913 依頼②）。
 *
 * **マスター管理＞物件で保守会社を選んでも、紐付け管理には出てこなかった。**
 * 設備情報は signage_master_properties.equipment に入るだけで、
 * 紐付け管理が見る signage_building_vendors とは別だったため。
 *
 * 物件の保存時にここを呼び、設備情報に出てくる保守会社を紐付けに足す。
 * **既にある紐付けは触らない**（人が status を pending / 解除に変えたものを戻さない）。
 */
export async function syncBuildingVendorsFromEquipment(propertyCode, equipment) {
  const list = Array.isArray(equipment) ? equipment : [];
  const vendorIds = [...new Set(list.map(e => e && e.vendor_id).filter(Boolean))];
  if (vendorIds.length === 0) return { added: 0 };

  const { data: existing, error: exError } = await supabase
    .from('signage_building_vendors')
    .select('vendor_id')
    .eq('property_code', String(propertyCode));
  if (exError) throw exError;

  const have = new Set((existing || []).map(r => String(r.vendor_id)));
  const toAdd = vendorIds.filter(id => !have.has(String(id)));
  if (toAdd.length === 0) return { added: 0 };

  const user = await getUser();
  const rows = toAdd.map(vendor_id => ({
    property_code: String(propertyCode),
    vendor_id,
    status: 'active',
    requested_by: user?.id ?? null,
    approved_by: user?.id ?? null
  }));
  const { error } = await supabase.from('signage_building_vendors').insert(rows);
  if (error) throw error;
  return { added: rows.length };
}

/**
 * 物件の点検情報を業務システム（biz）へ保存する（2026-09-19 の統合切り替え）。
 *
 * **正本は biz.property_inspections。** signage 側の jsonb には書かない。
 * 窓口は signage スキーマの RPC で、権限は signage の管理者（is_active_admin）で見る
 * ＝点検の担当者が業務システムの帳票・入金・支払に触れることはない。
 *
 * 画面で消された行は biz 側からも消す必要があるので、
 * **「今ある一覧」と「送られた一覧」を突き合わせて差分を出す**。
 *
 * **台がある大分類の点検種別（skipTypeIds）は、ここでは消しも送りもしない**（2026-10-14）。
 * その保守は台ごとに持ち、saveUnitInspectionsToBiz() が送る。「今ある一覧」には台の保守の集計が
 * 1行で返ってくるが、画面の一覧からは外してあるので、飛ばさないと「画面から消えた点検」に見える。
 *
 * @param {string} propertyCode
 * @param {Array} equipment 物件×点検種別の一覧（台がある大分類の点検種別を外した後のもの）
 * @param {Set<string>} [skipTypeIds] 台ごとに管理している点検種別の id（unitManagedTypeIds() の結果）
 */
export async function saveInspectionsToBiz(propertyCode, equipment, skipTypeIds = new Set()) {
  const list = (Array.isArray(equipment) ? equipment : []).filter(e => !(e && skipTypeIds.has(e.inspection_type_id)));

  const { data: current, error: readErr } = await supabase.rpc('inspections_for_property', { p_property_code: String(propertyCode) });
  if (readErr) throw readErr;

  const wantIds = new Set(list.map(e => e && e.inspection_type_id).filter(Boolean));
  // 画面から消えた点検を削除する。**残すと消したはずの案内が出続ける**
  for (const row of current || []) {
    if (skipTypeIds.has(row.inspection_type_id)) continue;
    if (!wantIds.has(row.inspection_type_id)) {
      const { error } = await supabase.rpc('delete_property_inspection', { p_id: row.id });
      if (error) throw error;
    }
  }

  // 保守会社用の設備コードは業務システム側の物件マスターで入力する（signage の画面には欄が無い）。
  // null を送ると RPC の on conflict で消えるので、今の値を引き継ぐ
  const currentCode = new Map((current || []).map(r => [r.inspection_type_id, r.maintainer_equipment_code]));

  for (const e of list) {
    if (!e || !e.inspection_type_id) continue;
    const months = Array.isArray(e.inspection_months) ? e.inspection_months.map(Number).filter(n => n >= 1 && n <= 12) : [];
    const { error } = await supabase.rpc('upsert_property_inspection', {
      p_property_code: String(propertyCode),
      p_inspection_type_id: e.inspection_type_id,
      p_maintainer_id: e.vendor_id || null,
      p_inspection_months: months,
      p_maintainer_equipment_code: e.maintainer_equipment_code ?? currentCode.get(e.inspection_type_id) ?? null,
      p_remarks: e.remarks || null,
      p_remarks2: e.remarks2 || null
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
 *
 * 台がある大分類の点検種別は、物件×点検種別の表（従来の編集表）からは書けない
 * （RPC が「この点検は台ごとに管理しています…」で断る）。従来の表と保存の対象から外すために使う。
 *
 * - 台がある大分類に属する点検種別（typeOptions から。まだどの台にも付いていない種別も含む）
 * - 台に既に付いている点検種別（**無効にした種別は typeOptions に出ない**ので、台の側からも拾う）
 *
 * @param {Array} units 物件の台（prop.units）
 * @param {Array} typeOptions 台に付けられる点検種別の選択肢（masterData.unitInspectionTypes）
 * @returns {Set<string>}
 */
export function unitManagedTypeIds(units, typeOptions) {
  const list = Array.isArray(units) ? units : [];
  const categories = new Set(list.map(u => u.category_code));
  const ids = new Set();
  (typeOptions || []).forEach(t => {
    if (categories.has(t.category_code)) ids.add(t.inspection_type_id);
  });
  list.forEach(u => (u.inspections || []).forEach(i => {
    if (i.inspection_type_id) ids.add(i.inspection_type_id);
  }));
  return ids;
}

// 点検月を重複なしの昇順にする（DB もこの形で持つ。並びや重複の違いを「変更あり」にしない）
function normalizeMonths(months) {
  const list = Array.isArray(months) ? months.map(Number).filter(n => n >= 1 && n <= 12) : [];
  return [...new Set(list)].sort((a, b) => a - b);
}

// 検査月を YYYY-MM にそろえる（DB は月初の日付 YYYY-MM-01、画面の入力欄は YYYY-MM）
function normalizeInspectedMonth(value) {
  return value ? String(value).slice(0, 7) : '';
}

/**
 * 台ごとの保守の、開いたときの状態と編集後の状態の差分を出す。
 *
 * **送るのは差分だけ**（全行の消して入れ直しはしない。変えていない行に触ると、ほかの人が同時に直した値を巻き戻す）。
 * キーは 台×点検種別（DB の一意制約と同じ）。
 * - deletes: 開いたときにあって、編集後に無い行（台の保守の id）
 * - upserts: 編集後にあって、開いたときに無い行／保守会社・点検月・検査月のどれかが違う行
 *
 * @param {Array} original 開いたときの台（prop.units の写し）
 * @param {Array} edited 編集後の台（同じ形。新しい行は inspection_id が無い）
 * @returns {{ upserts: Array, deletes: Array }}
 */
export function diffUnitInspections(original, edited) {
  const before = new Map();
  (original || []).forEach(u => (u.inspections || []).forEach(i => {
    before.set(`${u.unit_id}|${i.inspection_type_id}`, i);
  }));

  const upserts = [];
  const seen = new Set();
  (edited || []).forEach(u => (u.inspections || []).forEach(i => {
    if (!i.inspection_type_id) return;
    const key = `${u.unit_id}|${i.inspection_type_id}`;
    if (seen.has(key)) return;
    seen.add(key);
    const months = normalizeMonths(i.inspection_months);
    const inspectedMonth = normalizeInspectedMonth(i.inspected_on);
    const old = before.get(key);
    if (old
      && (old.vendor_id || null) === (i.vendor_id || null)
      && normalizeMonths(old.inspection_months).join(',') === months.join(',')
      && normalizeInspectedMonth(old.inspected_on) === inspectedMonth) {
      return;
    }
    upserts.push({
      unit_id: u.unit_id,
      inspection_type_id: i.inspection_type_id,
      vendor_id: i.vendor_id || null,
      inspection_months: months,
      // RPC は date で受ける。**YYYY-MM のままでは通らない**ので月初の日付にして送る
      inspected_on: inspectedMonth ? `${inspectedMonth}-01` : null
    });
  }));

  const deletes = [];
  before.forEach((i, key) => {
    if (!seen.has(key) && i.inspection_id) deletes.push({ inspection_id: i.inspection_id });
  });
  return { upserts, deletes };
}

/**
 * 台ごとの保守の差分を業務システム（biz）へ保存する。
 *
 * 窓口は signage スキーマの RPC（upsert_unit_inspection / delete_unit_inspection。signage の管理者だけ）。
 * 台に付けられる点検種別の規則などは業務システム側の DB が確かめ、断るときはその文言を返す。
 *
 * **1行ずつ別々に呼ぶ。** 同じ物件の台の保守を1つのトランザクションで続けて書くと、
 * 業務システムの画面からの保存と deadlock になり得る（RPC も1回で1行しか書かない）。
 *
 * **途中で失敗しても残りの行は続けて送る**（行どうしは独立している。物件モーダルは保存の後に閉じるので、
 * 最初の失敗で止めると後ろの行の入力が失われる）。失敗は errors に DB の文言のまま入れて返す。
 *
 * @param {{ upserts: Array, deletes: Array }} diff diffUnitInspections() の結果
 * @returns {Promise<{ saved: number, errors: string[] }>}
 */
export async function saveUnitInspectionsToBiz(diff) {
  let saved = 0;
  const errors = [];
  const run = async (fn, args) => {
    const { error } = await supabase.rpc(fn, args);
    if (error) errors.push(error.message || String(error));
    else saved += 1;
  };

  for (const d of diff.deletes || []) {
    await run('delete_unit_inspection', { p_id: d.inspection_id });
  }
  for (const u of diff.upserts || []) {
    await run('upsert_unit_inspection', {
      p_unit_id: u.unit_id,
      p_inspection_type_id: u.inspection_type_id,
      p_maintainer_id: u.vendor_id,
      p_inspection_months: u.inspection_months,
      p_inspected_on: u.inspected_on
    });
  }
  return { saved, errors };
}
