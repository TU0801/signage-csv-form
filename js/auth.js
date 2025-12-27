// auth.js
// 認証処理モジュール

import { supabase, getUser, signIn, signOut, getProfile, isAdmin } from './supabase-client.js';

// ========================================
// ページ読み込み時の認証チェック
// ========================================

export async function requireAuth() {
  const user = await getUser();
  if (!user) {
    window.location.href = 'login.html';
    return null;
  }
  return user;
}

// 管理者専用ページのチェック
export async function requireAdmin() {
  const user = await requireAuth();
  if (!user) return null;

  const admin = await isAdmin();
  if (!admin) {
    alert('管理者権限が必要です');
    window.location.href = 'index.html';
    return null;
  }
  return user;
}

// ========================================
// ログインフォーム処理
// ========================================

export async function handleLogin(email, password) {
  try {
    await signIn(email, password);
    window.location.href = 'index.html';
  } catch (error) {
    throw new Error('ログインに失敗しました: ' + error.message);
  }
}

// ========================================
// ログアウト処理
// ========================================

export async function handleLogout() {
  await signOut();
  window.location.href = 'login.html';
}

// ========================================
// セッション監視
// ========================================

supabase.auth.onAuthStateChange((event, session) => {
  if (event === 'SIGNED_OUT') {
    window.location.href = 'login.html';
  }
});

// ========================================
// ユーザー情報表示
// ========================================

export async function displayUserInfo(elementId) {
  const profile = await getProfile();
  const element = document.getElementById(elementId);
  if (element && profile) {
    element.textContent = profile.email;
  }
}

// ========================================
// ログアウトボタンの設定
// ========================================

export function setupLogoutButton(buttonId) {
  const button = document.getElementById(buttonId);
  if (button) {
    button.addEventListener('click', handleLogout);
  }
}
