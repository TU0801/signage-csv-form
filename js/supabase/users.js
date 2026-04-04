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

export async function createUser(email, password, companyName, role, vendorId = null) {
  const { data: { session: currentSession } } = await supabase.auth.getSession();

  const { data: authData, error: authError } = await supabase.auth.signUp({
    email, password,
    options: { data: { company_name: companyName, role: role } }
  });
  if (authError) throw authError;
  if (authData.user && authData.user.identities && authData.user.identities.length === 0) {
    throw new Error('このメールアドレスは既に登録されています');
  }
  if (!authData.user) throw new Error('ユーザー作成に失敗しました');

  const needsEmailConfirmation = !authData.session;

  const profileData = { id: authData.user.id, email: email, company_name: companyName, role: role };
  if (vendorId) profileData.vendor_id = vendorId;

  const { data: profile, error: profileError } = await supabase
    .from('signage_profiles')
    .upsert(profileData, { onConflict: 'id' })
    .select();
  if (profileError) throw new Error('プロファイル作成に失敗しました: ' + profileError.message);

  if (currentSession) {
    await supabase.auth.setSession({ access_token: currentSession.access_token, refresh_token: currentSession.refresh_token });
  }

  if (needsEmailConfirmation) {
    const result = authData.user;
    result._needsEmailConfirmation = true;
    return result;
  }
  return authData.user;
}
