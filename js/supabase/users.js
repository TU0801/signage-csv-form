// supabase/users.js - ユーザー管理

import { supabase } from './client.js';

export async function getAllProfiles() {
  const { data, error } = await supabase.from('signage_profiles').select('*').order('created_at', { ascending: false });
  if (error) throw error;
  return data;
}

export async function updateProfileRole(id, role) {
  const { data, error } = await supabase.from('signage_profiles').update({ role }).eq('id', id).select().single();
  if (error) throw error;
  return data;
}

export async function updateUserProfile(id, updates) {
  const { data: updateData, error } = await supabase.from('signage_profiles').update(updates).eq('id', id);
  if (error) throw error;

  const { data: profile, error: fetchError } = await supabase.from('signage_profiles').select('*').eq('id', id).single();
  if (fetchError) { console.error('Profile fetch error:', fetchError); return { id, ...updates }; }
  return profile;
}

export async function updateUserStatus(id, status) {
  const { data, error } = await supabase.from('signage_profiles').update({ status }).eq('id', id).select().single();
  if (error) throw error;
  return data;
}

// ユーザー作成・パスワード変更は service_role が必要なため、管理者検証付きの Edge Function で行う
// （supabase/functions/signage-admin-users）
async function invokeAdminUsers(body) {
  const { data, error } = await supabase.functions.invoke('signage-admin-users', { body });
  if (error) {
    let message = error.message;
    try {
      message = (await error.context.json()).error || message;
    } catch (_e) {
      // レスポンス本文が JSON でない場合は SDK のメッセージを使う
    }
    throw new Error(message);
  }
  return data;
}

export async function createUser(email, password, _companyName, role, vendorId = null) {
  const { user } = await invokeAdminUsers({ action: 'create_user', email, password, role, vendorId });
  return user;
}

export async function updateUserPassword(userId, password) {
  await invokeAdminUsers({ action: 'set_password', userId, password });
}
