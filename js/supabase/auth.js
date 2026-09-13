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

/**
 * ログアウト
 * @param {{scope?: 'global'|'local'|'others'}} [options]
 */
export async function signOut(options) {
  const { error } = await supabase.auth.signOut(options);
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

export const INACTIVE_ACCOUNT_MESSAGE = 'このアカウントは無効化されています。管理者にお問い合わせください。';

/**
 * 無効化されたユーザーならこの端末のセッションを破棄してログイン画面へ戻す。
 * @param {{status?: string}|null} profile
 * @returns {Promise<boolean>} 戻した場合 true（呼び出し側は以降の初期化を中断する）
 */
export async function rejectInactiveUser(profile) {
  if (profile?.status !== 'inactive') return false;
  await supabase.auth.signOut({ scope: 'local' });
  sessionStorage.setItem('loginNotice', INACTIVE_ACCOUNT_MESSAGE);
  window.location.href = 'login.html';
  return true;
}

function showSessionChangedOverlay() {
  if (document.getElementById('sessionChangedOverlay')) return;
  const overlay = document.createElement('div');
  overlay.id = 'sessionChangedOverlay';
  overlay.style.cssText = 'position:fixed;inset:0;z-index:100000;background:rgba(15,23,42,0.75);display:flex;align-items:center;justify-content:center;';
  overlay.innerHTML = `
    <div style="background:#fff;border-radius:12px;padding:1.5rem 2rem;max-width:420px;text-align:center;font-size:0.95rem;color:#1e293b;">
      <p style="margin:0 0 1rem;">別のタブでログアウト、または別のアカウントでログインしたため、この画面は使用できません。</p>
      <button type="button" style="padding:0.5rem 1.25rem;border:none;border-radius:6px;background:#2563eb;color:#fff;cursor:pointer;">画面を開き直す</button>
    </div>`;
  overlay.querySelector('button').addEventListener('click', () => window.location.reload());
  document.body.appendChild(overlay);
}

/**
 * 表示中の画面のユーザーと、別タブ等で切り替わった現在のセッションが食い違ったら画面を開き直す。
 * 管理画面を開いたまま別タブで一般ユーザーにログインすると、画面は管理者のまま一般ユーザー権限で
 * 書き込みが走り RLS に拒否されていた（2026-09-09 物件登録403・紐付け削除406）。
 * @param {string} userId 画面の初期化時に確認したユーザーID
 */
export function watchSessionUser(userId) {
  supabase.auth.onAuthStateChange(() => {
    // コールバック内で auth API を呼ぶとロック待ちになるため、抜けてから現在のセッションを確認する
    setTimeout(async () => {
      const { data: { session } } = await supabase.auth.getSession();
      const currentId = session?.user?.id || null;
      if (currentId === userId) return;
      // 離脱確認（一括入力の beforeunload）で移動が止められても、別人の権限で操作を続けられないよう画面を塞ぐ
      window.sessionUserChanged = true;
      showSessionChangedOverlay();
      if (currentId) {
        window.location.reload();
      } else {
        window.location.href = 'login.html';
      }
    }, 0);
  });
}
