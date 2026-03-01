/**
 * supabase-client.js
 * Supabase連携モジュール — 全DB操作のエントリーポイント
 *
 * テーブル一覧:
 *   signage_profiles         — ユーザープロファイル (id, email, company_name, role, vendor_id)
 *   signage_entries           — 点検データ (id, user_id, property_code, terminal_id, vendor_name, inspection_type, ...)
 *   signage_master_properties — 物件マスタ (id, property_code, property_name, terminals[JSON])
 *   signage_master_vendors    — 保守会社マスタ (id, vendor_name, emergency_contact, inspection_type)
 *   signage_master_inspection_types — 点検種別マスタ (id, inspection_name, template_no, default_text, category, show_on_board, sort_order)
 *   signage_master_categories — カテゴリマスタ (id, category_name, sort_order)
 *   signage_master_template_images — テンプレート画像 (id, image_key, display_name, image_url, category, sort_order)
 *   signage_master_settings   — 設定 (id, setting_key, setting_value)
 *   building_vendors          — 物件×保守会社紐付け (id, property_code, vendor_id, status)
 *   signage_vendor_inspections — 保守会社×点検種別紐付け (id, vendor_id, inspection_id, status)
 *   signage_building_equipment — 建物設備 (id, property_code, inspection_type_id, vendor_id, inspection_months, remarks)
 *   signage_ad_slots          — 広告枠 (id, slot_index, image_url, caption, link_url, is_active)
 *
 * 注意: DBはsnake_case。script.js向けにcamelCase変換する場合は getAllMasterDataCamelCase() を使用。
 *       admin.js/admin-masters.jsはsnake_caseのまま使用。
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.47.0';

const SUPABASE_URL = window.SUPABASE_URL || 'YOUR_SUPABASE_URL';
const SUPABASE_ANON_KEY = window.SUPABASE_ANON_KEY || 'YOUR_SUPABASE_ANON_KEY';

/** @type {import('@supabase/supabase-js').SupabaseClient} */
export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// ========================================
// 認証関連
// ========================================

/**
 * 現在の認証ユーザーを取得
 * @returns {Promise<import('@supabase/supabase-js').User|null>}
 */
export async function getUser() {
  try {
    const { data: { user }, error } = await supabase.auth.getUser();
    if (error) {
      console.error('Failed to get user:', error);
      return null;
    }
    return user;
  } catch (error) {
    console.error('Unexpected error getting user:', error);
    return null;
  }
}

/**
 * メール+パスワードでログイン
 * @param {string} email
 * @param {string} password
 * @returns {Promise<{user: object, session: object}>}
 */
export async function signIn(email, password) {
  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password,
  });
  if (error) throw error;
  return data;
}

/** ログアウト */
export async function signOut() {
  const { error } = await supabase.auth.signOut();
  if (error) throw error;
}

/**
 * 現在ユーザーのプロファイルを取得 (signage_profiles)
 * @returns {Promise<{id: string, email: string, company_name: string, role: 'admin'|'user', vendor_id: string|null}|null>}
 */
export async function getProfile() {
  const user = await getUser();
  if (!user) return null;

  const { data, error } = await supabase
    .from('signage_profiles')
    .select('*')
    .eq('id', user.id)
    .single();

  // PGRST116: プロファイルが存在しない場合はnullを返す
  if (error && error.code !== 'PGRST116') {
    console.error('Failed to get profile:', error);
    return null;
  }
  return data;
}

/** @returns {Promise<boolean>} 管理者かどうか */
export async function isAdmin() {
  const profile = await getProfile();
  return profile?.role === 'admin';
}

// ========================================
// マスターデータ取得
// ========================================

/**
 * 物件マスタ全件取得 (signage_master_properties)
 * @returns {Promise<Array<{id: string, property_code: string, property_name: string, terminals: Array<{terminalId: string, supplement: string}>}>>}
 */
export async function getMasterProperties() {
  const { data, error } = await supabase
    .from('signage_master_properties')
    .select('*')
    .order('property_code');
  if (error) throw error;
  return data;
}

/**
 * 保守会社マスタ全件取得 (signage_master_vendors)
 * @returns {Promise<Array<{id: string, vendor_name: string, emergency_contact: string|null, inspection_type: string|null}>>}
 */
export async function getMasterVendors() {
  const { data, error } = await supabase
    .from('signage_master_vendors')
    .select('*')
    .order('vendor_name');
  if (error) throw error;
  return data;
}

/**
 * 点検種別マスタ全件取得 (signage_master_inspection_types)
 * 注意: DBカラムは inspection_name（≠inspection_type）。entriesテーブルのinspection_typeに入る値。
 * @returns {Promise<Array<{id: string, inspection_name: string, template_no: string, default_text: string|null, category: string|null, show_on_board: boolean, sort_order: number}>>}
 */
export async function getMasterInspectionTypes() {
  const { data, error } = await supabase
    .from('signage_master_inspection_types')
    .select('*')
    .order('sort_order')
    .order('template_no');
  if (error) throw error;
  return data;
}

/**
 * 全マスターデータを一括取得（snake_case形式）
 * admin.js/admin-masters.js で使用。権限に応じて物件をフィルタ。
 * @returns {Promise<{properties: Array, vendors: Array, inspectionTypes: Array, categories: Array, templateImages: Array}>}
 */
export async function getAllMasterData() {
  const profile = await getProfile();

  // 権限に応じて物件を取得
  let propertiesRaw;
  if (profile && profile.role === 'admin') {
    // 管理者: 全物件
    propertiesRaw = await getMasterProperties();
  } else {
    // 一般ユーザー: 担当物件のみ
    propertiesRaw = await getAssignedBuildings();
  }

  const [vendors, inspectionTypes, categories, templateImages] = await Promise.all([
    getMasterVendors(),
    getMasterInspectionTypes(),
    getMasterCategories(),
    getMasterTemplateImages().catch(() => []), // テーブルが存在しない場合は空配列
  ]);

  // 物件を property_code でグループ化し、terminals配列を作成
  // Supabaseのデータ構造: terminals は JSON配列 [{terminalId, supplement}, ...]
  const propertiesMap = new Map();
  propertiesRaw.forEach(p => {
    const code = p.property_code;
    if (!propertiesMap.has(code)) {
      propertiesMap.set(code, {
        id: p.id,
        property_code: code,
        property_name: p.property_name,
        terminals: []
      });
    }

    // terminals が JSON配列の場合（新データ構造）
    if (Array.isArray(p.terminals)) {
      p.terminals.forEach(t => {
        propertiesMap.get(code).terminals.push({
          terminal_id: t.terminalId || t.terminal_id || '',
          supplement: t.supplement || ''
        });
      });
    } else if (p.terminal_id) {
      // terminal_id がフラットな場合（旧データ構造、フォールバック）
      propertiesMap.get(code).terminals.push({
        terminal_id: p.terminal_id,
        supplement: p.supplement || ''
      });
    }
  });

  const properties = Array.from(propertiesMap.values());

  return { properties, vendors, inspectionTypes, categories, templateImages };
}

/**
 * 全マスターデータをcamelCase形式で取得（script.js/bulk用）
 * property_code→propertyCode, vendor_name→vendorName, inspection_name→inspectionType 等に変換。
 * 注意: notices配列のinspectionTypeはDBのinspection_name値が入る。
 * @returns {Promise<{properties: Array<{propertyCode,propertyName,terminalId,supplement,address}>, vendors: Array<{id,vendorName,emergencyContact,inspectionType}>, categories: string[], notices: Array<{inspectionType,templateNo,noticeText,showOnBoard,...}>, templateImages: Array}>}
 */
export async function getAllMasterDataCamelCase() {
  const profile = await getProfile();

  // 権限に応じて物件を取得
  let propertiesRaw;
  if (profile && profile.role === 'admin') {
    // 管理者: 全物件
    propertiesRaw = await getMasterProperties();
  } else {
    // 一般ユーザー: 担当物件のみ
    propertiesRaw = await getAssignedBuildings();
  }

  // 他のマスターデータは全件取得
  const [vendors, inspectionTypes, categories, templateImages] = await Promise.all([
    getMasterVendors(),
    getMasterInspectionTypes(),
    getMasterCategories(),
    getMasterTemplateImages().catch(() => []),
  ]);

  // properties: グループ化された物件を1端末=1レコードにフラット化し、camelCaseに変換
  const properties = [];
  console.log('🔍 propertiesRaw:', propertiesRaw?.slice(0, 2)); // デバッグ
  propertiesRaw.forEach(p => {
    const terminals = Array.isArray(p.terminals) ? p.terminals : [];
    if (terminals.length === 0) {
      console.warn('⚠️ No terminals for property:', p.property_code);
    }
    terminals.forEach(t => {
      properties.push({
        propertyCode: p.property_code,
        propertyName: p.property_name,
        terminalId: t.terminalId || t.terminal_id || '',
        supplement: t.supplement || '',
        address: p.address || ''
      });
    });
  });
  console.log('🔍 properties (camelCase):', properties?.slice(0, 2)); // デバッグ

  // vendors: vendor_name -> vendorName, emergency_contact -> emergencyContact
  const vendorsFormatted = vendors.map(v => ({
    id: v.id,  // ID を含める（個別取得を避けるため）
    vendorName: v.vendor_name,
    emergencyContact: v.emergency_contact || '',
    category: v.category || '',
    inspectionType: v.inspection_type || ''
  }));

  // categories: そのまま配列として返す
  const categoriesFormatted = (categories || []).map(c => c.category_name || c);

  // inspectionTypes -> notices形式に変換
  const notices = inspectionTypes.map((it, index) => ({
    id: index + 1,
    inspectionType: it.inspection_name,
    categoryId: it.category_id || 0,
    showOnBoard: it.show_on_board !== false,
    templateNo: it.template_no || '',
    noticeText: it.default_text || '',
    frameNo: 2,
    image: '',
    daysBeforeStart: 30
  }));

  return {
    properties,
    vendors: vendorsFormatted,
    categories: categoriesFormatted,
    notices,
    templateImages: templateImages || []
  };
}

// ========================================
// Building-Vendor Relationships（物件×ベンダー紐付け）
// ========================================

/**
 * ユーザーの担当ビル一覧を取得。管理者は全ビル、一般ユーザーはvendor_idに紐づくビルのみ。
 * @returns {Promise<Array<{id: string, property_code: string, property_name: string, terminals: Array}>>}
 */
export async function getAssignedBuildings() {
  const profile = await getProfile();
  if (!profile) throw new Error('ログインが必要です');

  // 管理者は全ビルを返す
  if (profile.role === 'admin') {
    return await getMasterProperties();
  }

  // 一般ユーザー: vendor_idに紐づくビルのみ
  if (!profile.vendor_id) {
    return []; // vendor_idが未設定の場合は空配列
  }

  // Step 1: 紐付けを取得
  const { data: relationships, error: relError } = await supabase
    .from('building_vendors')
    .select('property_code')
    .eq('vendor_id', profile.vendor_id)
    .eq('status', 'active');

  if (relError) throw relError;
  if (!relationships || relationships.length === 0) return [];

  // Step 2: 物件データを取得
  const propertyCodes = relationships.map(r => r.property_code);
  const { data: properties, error: propError } = await supabase
    .from('signage_master_properties')
    .select('*')
    .in('property_code', propertyCodes);

  if (propError) throw propError;

  return properties || [];
}

/**
 * 特定保守会社の担当ビル一覧を取得（管理者用）
 * @param {string} vendorId - signage_master_vendors.id
 * @returns {Promise<Array<{id: string, property_code: string, property_name: string, terminals: Array}>>}
 */
export async function getBuildingsByVendor(vendorId) {
  // Step 1: 紐付けを取得
  const { data: relationships, error: relError } = await supabase
    .from('building_vendors')
    .select('property_code')
    .eq('vendor_id', vendorId)
    .eq('status', 'active');

  if (relError) throw relError;
  if (!relationships || relationships.length === 0) return [];

  // Step 2: 物件データを取得
  const propertyCodes = relationships.map(r => r.property_code);
  const { data: properties, error: propError } = await supabase
    .from('signage_master_properties')
    .select('*')
    .in('property_code', propertyCodes);

  if (propError) throw propError;

  return properties || [];
}

/**
 * ビル×保守会社の紐付け一覧を取得（管理者用）
 * @param {{vendorId?: string, status?: 'active'|'pending'|'deleted'}} filters
 * @returns {Promise<Array<{id: string, property_code: string, vendor_id: string, status: string, signage_master_vendors: {vendor_name: string}}>>}
 */
export async function getBuildingVendors(filters = {}) {
  let query = supabase
    .from('building_vendors')
    .select('*, signage_master_vendors(vendor_name, inspection_type)')
    .order('created_at', { ascending: false });

  if (filters.vendorId) {
    query = query.eq('vendor_id', filters.vendorId);
  }
  if (filters.status) {
    query = query.eq('status', filters.status);
  }

  const { data, error } = await query;
  if (error) throw error;
  return data;
}

/**
 * 承認待ちのビル追加リクエスト一覧を取得（status='pending'）
 * @returns {Promise<Array<{id: string, property_code: string, vendor_id: string, signage_master_vendors: {vendor_name: string}}>>}
 */
export async function getPendingBuildingRequests() {
  const { data, error } = await supabase
    .from('building_vendors')
    .select('*, signage_master_vendors(vendor_name)')
    .eq('status', 'pending')
    .order('created_at', { ascending: false });

  if (error) throw error;
  return data;
}

/**
 * ビル×保守会社紐付けを追加。一般ユーザーはpending（承認待ち）、管理者はactive。
 * @param {string} propertyCode - signage_master_properties.property_code
 * @param {string|null} [vendorId] - 省略時はprofile.vendor_idを使用
 */
export async function addBuildingVendor(propertyCode, vendorId = null) {
  const profile = await getProfile();
  if (!profile) throw new Error('ログインが必要です');

  const user = await getUser();
  const isAdminUser = profile.role === 'admin';
  const finalVendorId = vendorId || profile.vendor_id;

  if (!finalVendorId) {
    throw new Error('ベンダーIDが設定されていません');
  }

  const { data, error } = await supabase
    .from('building_vendors')
    .insert({
      property_code: propertyCode,
      vendor_id: finalVendorId,
      status: isAdminUser ? 'active' : 'pending',
      requested_by: user.id,
      approved_by: isAdminUser ? user.id : null
    })
    .select()
    .single();

  if (error) throw error;
  return data;
}

/** ビル追加リクエストを承認（status: pending→active） @param {string} buildingVendorId */
export async function approveBuildingRequest(buildingVendorId) {
  const user = await getUser();
  const { data, error } = await supabase
    .from('building_vendors')
    .update({
      status: 'active',
      approved_by: user.id
    })
    .eq('id', buildingVendorId)
    .select()
    .single();

  if (error) throw error;
  return data;
}

/** ビル追加リクエストを却下（レコード削除） @param {string} buildingVendorId */
export async function rejectBuildingRequest(buildingVendorId) {
  const { error } = await supabase
    .from('building_vendors')
    .delete()
    .eq('id', buildingVendorId);

  if (error) throw error;
}

/** ビル×保守会社紐付けを論理削除（status→'deleted'） @param {string} buildingVendorId */
export async function removeBuildingVendor(buildingVendorId) {
  const { data, error} = await supabase
    .from('building_vendors')
    .update({ status: 'deleted' })
    .eq('id', buildingVendorId)
    .select()
    .single();

  if (error) throw error;
  return data;
}

// ========================================
// Vendor-Inspection Relationships（ベンダー×点検種別紐付け）
// ========================================

/**
 * 保守会社の点検種別紐付け一覧を取得
 * @param {string} vendorId - signage_master_vendors.id
 * @returns {Promise<Array<{id: string, vendor_id: string, inspection_id: string, signage_master_inspection_types: {inspection_name: string, category: string}}>>}
 */
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

/** 保守会社×点検種別の紐付けを追加 @param {string} vendorId @param {string} inspectionId */
export async function addVendorInspection(vendorId, inspectionId) {
  const { data, error } = await supabase
    .from('signage_vendor_inspections')
    .insert({
      vendor_id: vendorId,
      inspection_id: inspectionId,
      status: 'active'
    })
    .select()
    .single();

  if (error) throw error;
  return data;
}

/** 保守会社×点検種別の紐付けを論理削除（status→'inactive'） @param {string} relationshipId */
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

// ========================================
// 点検データCRUD
// ========================================

/** 全エントリ取得（新しい順） @returns {Promise<Array>} signage_entries全件 */
export async function getEntries() {
  const { data, error } = await supabase
    .from('signage_entries')
    .select('*')
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data;
}

/** 当月以降のログインユーザーのエントリを取得 @returns {Promise<Array>} */
export async function getUserEntriesCurrentMonth() {
  const user = await getUser();
  if (!user) return [];

  // 当月の初日を計算
  const now = new Date();
  const firstOfMonth = new Date(now.getFullYear(), now.getMonth(), 1)
    .toISOString().split('T')[0];

  const { data, error } = await supabase
    .from('signage_entries')
    .select('*')
    .eq('user_id', user.id)
    .gte('created_at', firstOfMonth)
    .order('created_at', { ascending: false });

  if (error) {
    console.error('Error fetching user entries:', error);
    return [];
  }
  return data || [];
}

/**
 * エントリ1件作成。user_idは自動付与。
 * @param {Object} entry - property_code, terminal_id, vendor_name, inspection_type, inspection_start等
 */
export async function createEntry(entry) {
  const user = await getUser();
  if (!user) throw new Error('ログインが必要です');
  const { data, error } = await supabase
    .from('signage_entries')
    .insert({ ...entry, user_id: user.id })
    .select()
    .single();
  if (error) throw error;
  return data;
}

/** エントリ複数件一括作成 @param {Array<Object>} entries */
export async function createEntries(entries) {
  const user = await getUser();
  if (!user) throw new Error('ログインが必要です');
  const entriesWithUser = entries.map(e => ({ ...e, user_id: user.id }));
  const { data, error } = await supabase
    .from('signage_entries')
    .insert(entriesWithUser)
    .select();
  if (error) throw error;
  return data;
}

/** エントリ更新 @param {string} id @param {Object} entry - 更新するフィールド */
export async function updateEntry(id, entry) {
  const { data, error } = await supabase
    .from('signage_entries')
    .update(entry)
    .eq('id', id)
    .select()
    .single();
  if (error) throw error;
  return data;
}

/** エントリ物理削除 @param {string} id */
export async function deleteEntry(id) {
  const { error } = await supabase
    .from('signage_entries')
    .delete()
    .eq('id', id);
  if (error) throw error;
}

// ========================================
// 管理者用: 全データ取得
// ========================================

/**
 * 管理者用: フィルタ付きエントリ全件取得
 * @param {{propertyCode?: string, startDate?: string, endDate?: string, status?: string, statusArray?: string[], vendorName?: string}} filters
 */
export async function getAllEntries(filters = {}) {
  let query = supabase
    .from('signage_entries')
    .select('*')
    .order('created_at', { ascending: false });

  if (filters.propertyCode) {
    query = query.eq('property_code', filters.propertyCode);
  }
  if (filters.startDate) {
    query = query.gte('inspection_start', filters.startDate);
  }
  if (filters.endDate) {
    query = query.lte('inspection_start', filters.endDate);
  }
  if (filters.status) {
    query = query.eq('status', filters.status);
  }
  // 複数ステータスでのフィルター
  if (filters.statusArray && filters.statusArray.length > 0) {
    query = query.in('status', filters.statusArray);
  }
  // #8-2: 保守会社フィルター
  if (filters.vendorName) {
    query = query.eq('vendor_name', filters.vendorName);
  }

  const { data, error } = await query;
  if (error) throw error;
  return data;
}

/**
 * エントリのステータス一括更新
 * @param {string[]} ids
 * @param {'pending'|'draft'|'ready'|'exported'} status
 */
export async function updateEntriesStatusBulk(ids, status) {
  const { data, error } = await supabase
    .from('signage_entries')
    .update({ status })
    .in('id', ids)
    .select();
  if (error) throw error;
  return data;
}

// ========================================
// 管理者用: マスターデータ管理
// ========================================

/**
 * 物件追加
 * @param {{property_code: string|number, property_name: string, terminals: Array<{terminalId: string, supplement: string}>}} property
 */
export async function addProperty(property) {
  const record = {
    property_code: property.property_code,
    property_name: property.property_name,
    terminals: property.terminals
  };
  const { data, error } = await supabase
    .from('signage_master_properties')
    .insert(record)
    .select()
    .single();
  if (error) throw error;
  return data;
}

/** 物件更新 @param {string} id @param {{property_code: string|number, property_name: string, terminals: Array}} property */
export async function updateProperty(id, property) {
  const record = {
    property_code: property.property_code,
    property_name: property.property_name,
    terminals: property.terminals
  };
  const { data, error } = await supabase
    .from('signage_master_properties')
    .update(record)
    .eq('id', id)
    .select()
    .single();
  if (error) throw error;
  return data;
}

/** 物件削除 @param {string} id */
export async function deleteProperty(id) {
  const { error } = await supabase
    .from('signage_master_properties')
    .delete()
    .eq('id', id);
  if (error) throw error;
}

/** 保守会社追加 @param {{vendor_name: string, emergency_contact?: string, inspection_type?: string}} vendor */
export async function addVendor(vendor) {
  const { data, error } = await supabase
    .from('signage_master_vendors')
    .insert(vendor)
    .select()
    .single();
  if (error) throw error;
  return data;
}

/** 保守会社更新 @param {string} id @param {Object} vendor */
export async function updateVendor(id, vendor) {
  const { data, error } = await supabase
    .from('signage_master_vendors')
    .update(vendor)
    .eq('id', id)
    .select()
    .single();
  if (error) throw error;
  return data;
}

/** 保守会社削除 @param {string} id */
export async function deleteVendor(id) {
  const { error } = await supabase
    .from('signage_master_vendors')
    .delete()
    .eq('id', id);
  if (error) throw error;
}

/**
 * 点検種別追加
 * @param {{inspection_name: string, template_no?: string, default_text?: string, category?: string, show_on_board?: boolean, sort_order?: number}} inspectionType
 * 注意: inspection_name がユーザーに表示される「点検種別名」。entries.inspection_type に格納される値。
 */
export async function addInspectionType(inspectionType) {
  const { data, error } = await supabase
    .from('signage_master_inspection_types')
    .insert(inspectionType)
    .select()
    .single();
  if (error) throw error;
  return data;
}

/** 点検種別更新 @param {string} id @param {Object} inspectionType */
export async function updateInspectionType(id, inspectionType) {
  const { data, error } = await supabase
    .from('signage_master_inspection_types')
    .update(inspectionType)
    .eq('id', id)
    .select()
    .single();
  if (error) throw error;
  return data;
}

/** 点検種別削除 @param {string} id */
export async function deleteInspectionType(id) {
  const { error } = await supabase
    .from('signage_master_inspection_types')
    .delete()
    .eq('id', id);
  if (error) throw error;
}

// ========================================
// 管理者用: ユーザー管理
// ========================================

/** 全ユーザープロファイル取得（管理者用） @returns {Promise<Array>} */
export async function getAllProfiles() {
  const { data, error } = await supabase
    .from('signage_profiles')
    .select('*')
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data;
}

/** ユーザーロール変更 @param {string} id @param {'admin'|'user'} role */
export async function updateProfileRole(id, role) {
  const { data, error } = await supabase
    .from('signage_profiles')
    .update({ role })
    .eq('id', id)
    .select()
    .single();
  if (error) throw error;
  return data;
}

/** ユーザープロファイル更新（管理者用） @param {string} id @param {Object} updates */
export async function updateUserProfile(id, updates) {
  console.log('🔍 UPDATE開始:', { id, updates });

  // 更新実行（selectなし、RLS問題回避）
  const { data: updateData, error } = await supabase
    .from('signage_profiles')
    .update(updates)
    .eq('id', id);

  console.log('📝 UPDATE結果:', { updateData, error });

  if (error) {
    console.error('❌ updateUserProfile error:', error);
    throw error;
  }

  // 更新後に再取得
  const { data: profile, error: fetchError } = await supabase
    .from('signage_profiles')
    .select('*')
    .eq('id', id)
    .single();

  console.log('📥 SELECT結果:', { profile, fetchError });

  if (fetchError) {
    console.error('Profile fetch error:', fetchError);
    // エラーでも更新は成功しているので成功扱い
    return { id, ...updates };
  }

  return profile;
}

/** ユーザーステータス変更 @param {string} id @param {string} status */
export async function updateUserStatus(id, status) {
  const { data, error } = await supabase
    .from('signage_profiles')
    .update({ status })
    .eq('id', id)
    .select()
    .single();
  if (error) throw error;
  return data;
}

/**
 * ユーザー作成（管理者用）。signUp→プロファイルupsert→管理者セッション復元。
 * @param {string} email
 * @param {string} password - 6文字以上
 * @param {string} companyName
 * @param {'admin'|'user'} role
 * @param {string|null} [vendorId] - signage_master_vendors.id
 */
export async function createUser(email, password, companyName, role, vendorId = null) {
  // 現在のセッションを保存
  const { data: { session: currentSession } } = await supabase.auth.getSession();

  console.log('Creating user:', email, 'with vendor:', vendorId);

  // 1. ユーザー作成
  const { data: authData, error: authError } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: {
        company_name: companyName,
        role: role
      }
    }
  });

  console.log('SignUp result:', { authData, authError });

  if (authError) throw authError;

  // signUpが成功しても、既存ユーザーの場合はidentitiesが空
  if (authData.user && authData.user.identities && authData.user.identities.length === 0) {
    throw new Error('このメールアドレスは既に登録されています');
  }

  if (!authData.user) throw new Error('ユーザー作成に失敗しました');

  // メール確認が必要かチェック
  const needsEmailConfirmation = !authData.session;
  console.log('Needs email confirmation:', needsEmailConfirmation);

  // 2. プロファイルテーブルにも追加
  const profileData = {
    id: authData.user.id,
    email: email,
    company_name: companyName,
    role: role
  };

  // vendor_idが指定されている場合のみ追加
  if (vendorId) {
    profileData.vendor_id = vendorId;
  }

  const { data: profile, error: profileError } = await supabase
    .from('signage_profiles')
    .upsert(profileData, { onConflict: 'id' })
    .select();

  console.log('Profile upsert result:', { profile, profileError });

  if (profileError) {
    console.error('Profile creation failed:', profileError);
    throw new Error('プロファイル作成に失敗しました: ' + profileError.message);
  }

  // 3. 元の管理者セッションを復元
  if (currentSession) {
    await supabase.auth.setSession({
      access_token: currentSession.access_token,
      refresh_token: currentSession.refresh_token
    });
  }

  // メール確認が必要な場合は警告を含める
  if (needsEmailConfirmation) {
    const result = authData.user;
    result._needsEmailConfirmation = true;
    return result;
  }

  return authData.user;
}

// ========================================
// 管理者用: 承認ワークフロー
// ========================================

/** 承認待ちエントリ取得（status='draft'） @returns {Promise<Array>} */
export async function getPendingEntries() {
  const { data, error } = await supabase
    .from('signage_entries')
    .select('*')
    .eq('status', 'draft')
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data;
}

/** エントリ承認（status: draft→ready） @param {string} id */
export async function approveEntry(id) {
  const { data, error } = await supabase
    .from('signage_entries')
    .update({
      status: 'ready'
    })
    .eq('id', id)
    .select()
    .single();
  if (error) throw error;
  return data;
}

/** エントリ一括承認 @param {string[]} ids */
export async function approveEntries(ids) {
  const { data, error } = await supabase
    .from('signage_entries')
    .update({
      status: 'ready'
    })
    .in('id', ids)
    .select();
  if (error) throw error;
  return data;
}

/** エントリ却下（物理削除） @param {string} id @param {string} [reason] */
export async function rejectEntry(id, reason = '') {
  // 却下 = 削除（スキーマにrejectedステータスがないため）
  // reason は将来的にログや通知で使用可能（現在は未使用）
  const { error } = await supabase
    .from('signage_entries')
    .delete()
    .eq('id', id);
  if (error) throw error;
  return { id, reason };
}

/** エントリ申請（pending→draft） @param {string} id */
export async function submitEntry(id) {
  const { data, error } = await supabase
    .from('signage_entries')
    .update({ status: 'draft' })
    .eq('id', id)
    .select()
    .single();
  if (error) throw error;
  return data;
}

/** エントリ一括申請 @param {string[]} ids */
export async function submitEntries(ids) {
  const { data, error } = await supabase
    .from('signage_entries')
    .update({ status: 'draft' })
    .in('id', ids)
    .select();
  if (error) throw error;
  return data;
}

/** 未申請に戻す（status→'pending'） @param {string} id */
export async function revertToPending(id) {
  const { data, error } = await supabase
    .from('signage_entries')
    .update({ status: 'pending' })
    .eq('id', id)
    .select()
    .single();
  if (error) throw error;
  return data;
}

// ========================================
// 設定管理
// ========================================

/** 設定全件取得 @returns {Promise<Array<{setting_key: string, setting_value: string}>>} */
export async function getSettings() {
  const { data, error } = await supabase
    .from('signage_master_settings')
    .select('*');
  if (error) throw error;
  return data;
}

/** 設定値取得 @param {string} key @returns {Promise<string|null>} */
export async function getSetting(key) {
  const { data, error } = await supabase
    .from('signage_master_settings')
    .select('setting_value')
    .eq('setting_key', key)
    .single();
  if (error && error.code !== 'PGRST116') throw error;
  return data?.setting_value;
}

/** 設定値更新（upsert） @param {string} key @param {string|number} value */
export async function updateSetting(key, value) {
  const { data, error } = await supabase
    .from('signage_master_settings')
    .upsert({
      setting_key: key,
      setting_value: String(value),
      updated_at: new Date().toISOString()
    }, { onConflict: 'setting_key' })
    .select()
    .single();
  if (error) throw error;
  return data;
}

/** 設定一括更新 @param {Object<string, string|number>} settings - {key: value}形式 */
export async function updateSettings(settings) {
  const updates = Object.entries(settings).map(([key, value]) => ({
    setting_key: key,
    setting_value: String(value),
    updated_at: new Date().toISOString()
  }));

  const { data, error } = await supabase
    .from('signage_master_settings')
    .upsert(updates, { onConflict: 'setting_key' })
    .select();
  if (error) throw error;
  return data;
}

// ========================================
// カテゴリ管理
// ========================================

/** カテゴリマスタ全件取得 @returns {Promise<Array<{id: string, category_name: string, sort_order: number}>>} */
export async function getMasterCategories() {
  const { data, error } = await supabase
    .from('signage_master_categories')
    .select('*')
    .order('sort_order');
  if (error) throw error;
  return data;
}

/** カテゴリ追加 @param {{category_name: string, sort_order?: number}} categoryData */
export async function addCategory(categoryData) {
  const { data, error } = await supabase
    .from('signage_master_categories')
    .insert(categoryData)
    .select()
    .single();
  if (error) throw error;
  return data;
}

/** カテゴリ更新 @param {string} id @param {Object} categoryData */
export async function updateCategory(id, categoryData) {
  const { data, error } = await supabase
    .from('signage_master_categories')
    .update(categoryData)
    .eq('id', id)
    .select()
    .single();
  if (error) throw error;
  return data;
}

/** カテゴリ削除 @param {string} id */
export async function deleteCategory(id) {
  const { error } = await supabase
    .from('signage_master_categories')
    .delete()
    .eq('id', id);
  if (error) throw error;
}

// ========================================
// テンプレート画像マスタ管理
// ========================================

/** テンプレート画像マスタ全件取得 @returns {Promise<Array<{id: string, image_key: string, display_name: string, image_url: string, category: string|null, sort_order: number}>>} */
export async function getMasterTemplateImages() {
  const { data, error } = await supabase
    .from('signage_master_template_images')
    .select('*')
    .order('sort_order')
    .order('display_name');
  if (error) throw error;
  return data;
}

/** テンプレート画像追加 @param {{image_key: string, display_name: string, image_url: string, category?: string, sort_order?: number}} templateImage */
export async function addTemplateImage(templateImage) {
  const { data, error } = await supabase
    .from('signage_master_template_images')
    .insert(templateImage)
    .select()
    .single();
  if (error) throw error;
  return data;
}

/** テンプレート画像更新 @param {string} id @param {Object} templateImage */
export async function updateTemplateImage(id, templateImage) {
  const { data, error } = await supabase
    .from('signage_master_template_images')
    .update(templateImage)
    .eq('id', id)
    .select()
    .single();
  if (error) throw error;
  return data;
}

/** テンプレート画像削除 @param {string} id */
export async function deleteTemplateImage(id) {
  const { error } = await supabase
    .from('signage_master_template_images')
    .delete()
    .eq('id', id);
  if (error) throw error;
}

/** テンプレート画像をStorageにアップロード @param {File} file @param {string} imageKey @returns {Promise<string>} publicUrl */
export async function uploadTemplateImageFile(file, imageKey) {
  if (!file) return null;

  const user = await getUser();
  if (!user) throw new Error('ログインが必要です');

  // ファイル拡張子を取得
  const extension = file.name.split('.').pop().toLowerCase();
  if (!['png', 'jpg', 'jpeg'].includes(extension)) {
    throw new Error('PNG、JPG形式の画像のみアップロードできます');
  }

  // ファイルサイズチェック（5MB）
  if (file.size > 5 * 1024 * 1024) {
    throw new Error('ファイルサイズは5MB以下にしてください');
  }

  // テンプレート画像用のパス
  const fileName = `templates/${imageKey}.${extension}`;

  // Storageにアップロード（既存ファイルがあれば上書き）
  const { data, error } = await supabase.storage
    .from(STORAGE_BUCKET)
    .upload(fileName, file, {
      contentType: file.type,
      upsert: true
    });

  if (error) {
    console.error('Template image upload error:', error);
    throw new Error('画像のアップロードに失敗しました: ' + error.message);
  }

  // 公開URLを取得
  const { data: urlData } = supabase.storage
    .from(STORAGE_BUCKET)
    .getPublicUrl(data.path);

  return urlData.publicUrl;
}

/** テンプレート画像をStorageから削除 @param {string} imageUrl */
export async function deleteTemplateImageFile(imageUrl) {
  if (!imageUrl) return;

  const bucketUrl = `${SUPABASE_URL}/storage/v1/object/public/${STORAGE_BUCKET}/`;
  if (!imageUrl.startsWith(bucketUrl)) return;

  const path = imageUrl.replace(bucketUrl, '');

  const { error } = await supabase.storage
    .from(STORAGE_BUCKET)
    .remove([path]);

  if (error) {
    console.error('Template image delete error:', error);
  }
}

// ========================================
// Storage: 画像アップロード
// ========================================

const STORAGE_BUCKET = 'poster-images';

// Base64データをBlobに変換
function base64ToBlob(base64Data) {
  const [header, data] = base64Data.split(',');
  const mimeMatch = header.match(/data:(.*?);/);
  const mimeType = mimeMatch ? mimeMatch[1] : 'image/jpeg';
  const byteCharacters = atob(data);
  const byteNumbers = new Array(byteCharacters.length);
  for (let i = 0; i < byteCharacters.length; i++) {
    byteNumbers[i] = byteCharacters.charCodeAt(i);
  }
  const byteArray = new Uint8Array(byteNumbers);
  return new Blob([byteArray], { type: mimeType });
}

/** カスタムポスター画像をbase64からアップロード @param {string} base64Data @returns {Promise<string|null>} publicUrl */
export async function uploadPosterImage(base64Data) {
  if (!base64Data) return null;

  const user = await getUser();
  if (!user) throw new Error('ログインが必要です');

  // ファイル名を生成（ユーザーID + タイムスタンプ + ランダム文字列）
  const timestamp = Date.now();
  const random = Math.random().toString(36).substring(2, 8);
  const extension = base64Data.includes('image/png') ? 'png' : 'jpg';
  const fileName = `${user.id}/${timestamp}_${random}.${extension}`;

  // Base64をBlobに変換
  const blob = base64ToBlob(base64Data);

  // Storageにアップロード
  const { data, error } = await supabase.storage
    .from(STORAGE_BUCKET)
    .upload(fileName, blob, {
      contentType: blob.type,
      upsert: false
    });

  if (error) {
    console.error('Storage upload error:', error);
    throw new Error('画像のアップロードに失敗しました: ' + error.message);
  }

  // 公開URLを取得
  const { data: urlData } = supabase.storage
    .from(STORAGE_BUCKET)
    .getPublicUrl(data.path);

  return urlData.publicUrl;
}

/** ポスター画像をStorageから削除 @param {string} imageUrl */
export async function deletePosterImage(imageUrl) {
  if (!imageUrl) return;

  // URLからパスを抽出
  const bucketUrl = `${SUPABASE_URL}/storage/v1/object/public/${STORAGE_BUCKET}/`;
  if (!imageUrl.startsWith(bucketUrl)) return;

  const path = imageUrl.replace(bucketUrl, '');

  const { error } = await supabase.storage
    .from(STORAGE_BUCKET)
    .remove([path]);

  if (error) {
    console.error('Storage delete error:', error);
  }
}

// ========================================
// 広告枠管理 (v1.24.0)
// ========================================

/** 広告枠データ取得（slot_index 1-7） @returns {Promise<Array<{slot_index: number, image_url: string|null, caption: string, link_url: string, is_active: boolean}>>} */
export async function getAdSlots() {
  const { data, error } = await supabase
    .from('signage_ad_slots')
    .select('*')
    .order('slot_index');
  if (error) throw error;
  return data;
}

/** 広告枠更新 @param {number} slotIndex 1-7 @param {{imageUrl?: string, caption?: string, linkUrl?: string, isActive?: boolean}} data */
export async function upsertAdSlot(slotIndex, { imageUrl, caption, linkUrl, isActive }) {
  const { error } = await supabase
    .from('signage_ad_slots')
    .update({
      image_url: imageUrl,
      caption,
      link_url: linkUrl,
      is_active: isActive,
      updated_at: new Date().toISOString()
    })
    .eq('slot_index', slotIndex);
  if (error) throw error;
}

/** 広告枠画像アップロード @param {File} file @param {number} slotIndex @returns {Promise<string|null>} publicUrl */
export async function uploadAdImage(file, slotIndex) {
  if (!file) return null;

  const user = await getUser();
  if (!user) throw new Error('ログインが必要です');

  const extension = file.name.split('.').pop().toLowerCase();
  if (!['png', 'jpg', 'jpeg'].includes(extension)) {
    throw new Error('PNG、JPG形式の画像のみアップロードできます');
  }

  if (file.size > 5 * 1024 * 1024) {
    throw new Error('ファイルサイズは5MB以下にしてください');
  }

  const fileName = `ads/slot_${slotIndex}.${extension}`;

  const { data, error } = await supabase.storage
    .from(STORAGE_BUCKET)
    .upload(fileName, file, {
      contentType: file.type,
      upsert: true
    });

  if (error) {
    console.error('Ad image upload error:', error);
    throw new Error('画像のアップロードに失敗しました: ' + error.message);
  }

  const { data: urlData } = supabase.storage
    .from(STORAGE_BUCKET)
    .getPublicUrl(data.path);

  return urlData.publicUrl;
}

/** 広告枠画像削除 @param {string} imageUrl */
export async function deleteAdImage(imageUrl) {
  if (!imageUrl) return;

  const bucketUrl = `${SUPABASE_URL}/storage/v1/object/public/${STORAGE_BUCKET}/`;
  if (!imageUrl.startsWith(bucketUrl)) return;

  const path = imageUrl.replace(bucketUrl, '');

  const { error } = await supabase.storage
    .from(STORAGE_BUCKET)
    .remove([path]);

  if (error) {
    console.error('Ad image delete error:', error);
  }
}

// ========================================
// 建物設備管理
// ========================================

/**
 * 設備情報取得（物件コード指定）
 * @param {string} propertyCode - 物件コード（signage_master_properties.property_code）
 * @returns {Promise<Array<{id: number, property_code: string, equipment_name: string, location: string, created_at: string}>>}
 */
export async function getBuildingEquipment(propertyCode) {
  const { data, error } = await supabase
    .from('signage_building_equipment')
    .select('*')
    .eq('property_code', propertyCode)
    .order('created_at');
  if (error) throw error;
  return data || [];
}

/**
 * 設備情報追加
 * @param {{property_code: string, equipment_name: string, location?: string}} equipment - DBカラム名(snake_case)で指定
 * @returns {Promise<Object>} 挿入されたレコード
 */
export async function addBuildingEquipment(equipment) {
  const { data, error } = await supabase
    .from('signage_building_equipment')
    .insert(equipment)
    .select()
    .single();
  if (error) throw error;
  return data;
}

/**
 * 設備情報削除
 * @param {number} id - signage_building_equipment.id
 */
export async function deleteBuildingEquipment(id) {
  const { error } = await supabase
    .from('signage_building_equipment')
    .delete()
    .eq('id', id);
  if (error) throw error;
}
