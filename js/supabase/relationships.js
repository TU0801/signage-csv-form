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
 */
export async function saveInspectionsToBiz(propertyCode, equipment) {
  const list = Array.isArray(equipment) ? equipment : [];

  const { data: current, error: readErr } = await supabase.rpc('inspections_for_property', { p_property_code: String(propertyCode) });
  if (readErr) throw readErr;

  const wantIds = new Set(list.map(e => e && e.inspection_type_id).filter(Boolean));
  // 画面から消えた点検を削除する。**残すと消したはずの案内が出続ける**
  for (const row of current || []) {
    if (!wantIds.has(row.inspection_type_id)) {
      const { error } = await supabase.rpc('delete_property_inspection', { p_id: row.id });
      if (error) throw error;
    }
  }

  for (const e of list) {
    if (!e || !e.inspection_type_id) continue;
    const months = Array.isArray(e.inspection_months) ? e.inspection_months.map(Number).filter(n => n >= 1 && n <= 12) : [];
    const { error } = await supabase.rpc('upsert_property_inspection', {
      p_property_code: String(propertyCode),
      p_inspection_type_id: e.inspection_type_id,
      p_maintainer_id: e.vendor_id || null,
      p_inspection_months: months,
      p_maintainer_equipment_code: null,
      p_remarks: e.remarks || null,
      p_remarks2: e.remarks2 || null
    });
    if (error) throw error;
  }
  return { saved: list.length };
}
