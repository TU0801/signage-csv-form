// supabase/auth.js - 認証関連

import { supabase } from './client.js';

/**
 * 現在の認証ユーザーを取得
 * @returns {Promise<import('@supabase/supabase-js').User|null>}
 */
export async function getUser() {
  try {
    const { data: { user }, error } = await supabase.auth.getUser();
    if (error) {
      // 未ログイン時の AuthSessionMissingError は想定内のためログを出さない
      if (error.name !== 'AuthSessionMissingError') {
        console.error('Failed to get user:', error);
      }
      return null;
    }
    return user;
  } catch (error) {
    if (error?.name !== 'AuthSessionMissingError') {
      console.error('Unexpected error getting user:', error);
    }
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
