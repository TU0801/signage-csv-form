// supabase-client.js
// Supabase連携モジュール

import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';

// 環境変数から取得（本番環境では適切に設定）
const SUPABASE_URL = window.SUPABASE_URL || 'YOUR_SUPABASE_URL';
const SUPABASE_ANON_KEY = window.SUPABASE_ANON_KEY || 'YOUR_SUPABASE_ANON_KEY';

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// ========================================
// 認証関連
// ========================================

// 認証状態の取得
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

// ログイン
export async function signIn(email, password) {
  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password,
  });
  if (error) throw error;
  return data;
}

// ログアウト
export async function signOut() {
  const { error } = await supabase.auth.signOut();
  if (error) throw error;
}

// ユーザープロファイル取得
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

// 管理者チェック
export async function isAdmin() {
  const profile = await getProfile();
  return profile?.role === 'admin';
}

// ========================================
// マスターデータ取得
// ========================================

export async function getMasterProperties() {
  const { data, error } = await supabase
    .from('signage_master_properties')
    .select('*')
    .order('property_code');
  if (error) throw error;
  return data;
}

export async function getMasterVendors() {
  const { data, error } = await supabase
    .from('signage_master_vendors')
    .select('*')
    .order('vendor_name');
  if (error) throw error;
  return data;
}

export async function getMasterInspectionTypes() {
  const { data, error } = await supabase
    .from('signage_master_inspection_types')
    .select('*')
    .order('template_no');
  if (error) throw error;
  return data;
}

// 全マスターデータを一括取得
export async function getAllMasterData() {
  const [propertiesRaw, vendors, inspectionTypes, categories] = await Promise.all([
    getMasterProperties(),
    getMasterVendors(),
    getMasterInspectionTypes(),
    getMasterCategories(),
  ]);

  // 物件を property_code でグループ化し、terminals配列を作成
  // Supabaseのデータ構造: terminals は JSON配列 [{terminalId, supplement}, ...]
  const propertiesMap = new Map();
  propertiesRaw.forEach(p => {
    const code = p.property_code;
    if (!propertiesMap.has(code)) {
      propertiesMap.set(code, {
        property_code: code,
        property_name: p.property_name,
        address: p.address || '',
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

  return { properties, vendors, inspectionTypes, categories };
}

// マスターデータをキャメルケースに変換（script.js用）
export async function getAllMasterDataCamelCase() {
  const data = await getAllMasterData();

  // properties: グループ化された物件を1端末=1レコードにフラット化し、camelCaseに変換
  const properties = [];
  data.properties.forEach(p => {
    p.terminals.forEach(t => {
      properties.push({
        propertyCode: p.property_code,
        propertyName: p.property_name,
        terminalId: t.terminal_id,
        supplement: t.supplement || '',
        address: p.address || ''
      });
    });
  });

  // vendors: vendor_name -> vendorName, emergency_contact -> emergencyContact
  const vendors = data.vendors.map(v => ({
    vendorName: v.vendor_name,
    emergencyContact: v.emergency_contact || '',
    category: v.category || ''
  }));

  // categories: そのまま配列として返す
  const categories = (data.categories || []).map(c => c.category_name || c);

  // inspectionTypes -> notices形式に変換
  const notices = data.inspectionTypes.map((it, index) => ({
    id: index + 1,
    inspectionType: it.inspection_name,
    categoryId: it.category_id || 0,
    showOnBoard: it.show_on_board !== false,
    templateNo: it.template_no || '',
    noticeText: it.notice_text || '',
    frameNo: 2,
    image: '',
    daysBeforeStart: 30
  }));

  return { properties, vendors, categories, notices };
}

// ========================================
// 点検データCRUD
// ========================================

export async function getEntries() {
  const { data, error } = await supabase
    .from('signage_entries')
    .select('*')
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data;
}

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

  const { data, error } = await query;
  if (error) throw error;
  return data;
}

// ステータス一括更新
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

export async function addProperty(property) {
  // terminalsが配列の場合、各端末ごとにレコードを作成
  if (Array.isArray(property.terminals) && property.terminals.length > 0) {
    const records = property.terminals.map(terminal => ({
      property_code: property.property_code,
      property_name: property.property_name,
      terminal_id: terminal.terminal_id,
      supplement: terminal.supplement || property.supplement || '',
      address: property.address || ''
    }));
    const { data, error } = await supabase
      .from('signage_master_properties')
      .insert(records)
      .select();
    if (error) throw error;
    return data;
  } else {
    // 旧形式の場合（後方互換性）
    const { data, error } = await supabase
      .from('signage_master_properties')
      .insert(property)
      .select()
      .single();
    if (error) throw error;
    return data;
  }
}

export async function updateProperty(id, property) {
  // terminalsが配列の場合、同じproperty_codeの全レコードを更新/追加/削除
  if (Array.isArray(property.terminals) && property.terminals.length > 0) {
    // 既存のレコードを取得
    const { data: existing, error: fetchError } = await supabase
      .from('signage_master_properties')
      .select('*')
      .eq('property_code', property.property_code);
    if (fetchError) throw fetchError;

    // 既存のレコードを全て削除
    if (existing && existing.length > 0) {
      const { error: deleteError } = await supabase
        .from('signage_master_properties')
        .delete()
        .eq('property_code', property.property_code);
      if (deleteError) throw deleteError;
    }

    // 新しいレコードを挿入
    const records = property.terminals.map(terminal => ({
      property_code: property.property_code,
      property_name: property.property_name,
      terminal_id: terminal.terminal_id,
      supplement: terminal.supplement || '',
      address: property.address || ''
    }));
    const { data, error } = await supabase
      .from('signage_master_properties')
      .insert(records)
      .select();
    if (error) throw error;
    return data;
  } else {
    // 旧形式の場合（後方互換性）
    const { data, error } = await supabase
      .from('signage_master_properties')
      .update(property)
      .eq('id', id)
      .select()
      .single();
    if (error) throw error;
    return data;
  }
}

export async function deleteProperty(id) {
  const { error } = await supabase
    .from('signage_master_properties')
    .delete()
    .eq('id', id);
  if (error) throw error;
}

export async function addVendor(vendor) {
  const { data, error } = await supabase
    .from('signage_master_vendors')
    .insert(vendor)
    .select()
    .single();
  if (error) throw error;
  return data;
}

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

export async function deleteVendor(id) {
  const { error } = await supabase
    .from('signage_master_vendors')
    .delete()
    .eq('id', id);
  if (error) throw error;
}

export async function addInspectionType(inspectionType) {
  const { data, error } = await supabase
    .from('signage_master_inspection_types')
    .insert(inspectionType)
    .select()
    .single();
  if (error) throw error;
  return data;
}

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

export async function getAllProfiles() {
  const { data, error } = await supabase
    .from('signage_profiles')
    .select('*')
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data;
}

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

// ユーザー作成（管理者用）- 直接パスワード設定
export async function createUser(email, password, companyName, role) {
  // 現在のセッションを保存
  const { data: { session: currentSession } } = await supabase.auth.getSession();

  console.log('Creating user:', email);

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
  const { data: profileData, error: profileError } = await supabase
    .from('signage_profiles')
    .upsert({
      id: authData.user.id,
      email: email,
      company_name: companyName,
      role: role
    }, { onConflict: 'id' })
    .select();

  console.log('Profile upsert result:', { profileData, profileError });

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

export async function getPendingEntries() {
  const { data, error } = await supabase
    .from('signage_entries')
    .select('*')
    .eq('status', 'draft')
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data;
}

export async function approveEntry(id) {
  const { data, error } = await supabase
    .from('signage_entries')
    .update({
      status: 'submitted'
    })
    .eq('id', id)
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function approveEntries(ids) {
  const { data, error } = await supabase
    .from('signage_entries')
    .update({
      status: 'submitted'
    })
    .in('id', ids)
    .select();
  if (error) throw error;
  return data;
}

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

// ========================================
// 設定管理
// ========================================

export async function getSettings() {
  const { data, error } = await supabase
    .from('signage_master_settings')
    .select('*');
  if (error) throw error;
  return data;
}

export async function getSetting(key) {
  const { data, error } = await supabase
    .from('signage_master_settings')
    .select('setting_value')
    .eq('setting_key', key)
    .single();
  if (error && error.code !== 'PGRST116') throw error;
  return data?.setting_value;
}

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

export async function getMasterCategories() {
  const { data, error } = await supabase
    .from('signage_master_categories')
    .select('*')
    .order('sort_order');
  if (error) throw error;
  return data;
}

export async function addCategory(categoryData) {
  const { data, error } = await supabase
    .from('signage_master_categories')
    .insert(categoryData)
    .select()
    .single();
  if (error) throw error;
  return data;
}

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

export async function deleteCategory(id) {
  const { error } = await supabase
    .from('signage_master_categories')
    .delete()
    .eq('id', id);
  if (error) throw error;
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

// 画像をStorageにアップロードしてURLを返す
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

// 画像を削除
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
