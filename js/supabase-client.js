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
  const { data: { user } } = await supabase.auth.getUser();
  return user;
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

  if (error) throw error;
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
  const [properties, vendors, inspectionTypes] = await Promise.all([
    getMasterProperties(),
    getMasterVendors(),
    getMasterInspectionTypes(),
  ]);
  return { properties, vendors, inspectionTypes };
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
    .select(`
      *,
      signage_profiles!inner(email, company_name)
    `)
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

  const { data, error } = await query;
  if (error) throw error;
  return data;
}

// ========================================
// 管理者用: マスターデータ管理
// ========================================

export async function addProperty(property) {
  const { data, error } = await supabase
    .from('signage_master_properties')
    .insert(property)
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function updateProperty(id, property) {
  const { data, error } = await supabase
    .from('signage_master_properties')
    .update(property)
    .eq('id', id)
    .select()
    .single();
  if (error) throw error;
  return data;
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

// ========================================
// 管理者用: 承認ワークフロー
// ========================================

export async function getPendingEntries() {
  const { data, error } = await supabase
    .from('signage_entries')
    .select(`
      *,
      signage_profiles!inner(email, company_name)
    `)
    .eq('status', 'pending')
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data;
}

export async function approveEntry(id) {
  const user = await getUser();
  const { data, error } = await supabase
    .from('signage_entries')
    .update({
      status: 'approved',
      approved_by: user.id,
      approved_at: new Date().toISOString()
    })
    .eq('id', id)
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function approveEntries(ids) {
  const user = await getUser();
  const { data, error } = await supabase
    .from('signage_entries')
    .update({
      status: 'approved',
      approved_by: user.id,
      approved_at: new Date().toISOString()
    })
    .in('id', ids)
    .select();
  if (error) throw error;
  return data;
}

export async function rejectEntry(id, reason = '') {
  const user = await getUser();
  const { data, error } = await supabase
    .from('signage_entries')
    .update({
      status: 'rejected',
      approved_by: user.id,
      approved_at: new Date().toISOString(),
      rejection_reason: reason
    })
    .eq('id', id)
    .select()
    .single();
  if (error) throw error;
  return data;
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
