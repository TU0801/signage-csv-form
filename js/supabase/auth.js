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

// createUser の signUp は一時的にこのタブのセッションを新ユーザーに切り替えるため、その間は監視を止める
let sessionWatchSuspended = false;
export function suspendSessionWatch(suspended) {
  sessionWatchSuspended = suspended;
}

/**
 * 表示中の画面のユーザーと、別タブ等で切り替わった現在のセッションが食い違ったら画面を開き直す。
 * 管理画面を開いたまま別タブで一般ユーザーにログインすると、画面は管理者のまま一般ユーザー権限で
 * 書き込みが走り RLS に拒否されていた（2026-09-09 物件登録403・紐付け削除406）。
 * @param {string} userId 画面の初期化時に確認したユーザーID
 */
export function watchSessionUser(userId) {
  let timer = null;
  supabase.auth.onAuthStateChange(() => {
    if (sessionWatchSuspended) return;
    clearTimeout(timer);
    // 他タブの createUser による一時的な切り替えは直後に元へ戻るため、少し待ってから判定する
    timer = setTimeout(async () => {
      if (sessionWatchSuspended) return;
      const { data: { session } } = await supabase.auth.getSession();
      const currentId = session?.user?.id || null;
      if (currentId === userId) return;
      if (currentId) {
        window.location.reload();
      } else {
        window.location.href = 'login.html';
      }
    }, 1500);
  });
}
