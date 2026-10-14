/**
 * UI共通ユーティリティ（ESモジュール）
 * admin.js, admin-masters.js 等で共有する関数を集約。
 */

// escapeHtml は shared-utils.js に移動。後方互換のため re-export
export { escapeHtml } from './shared-utils.js';

// 直前のトーストを消すタイマー。**次のトーストを出すときに止める**（止めないと、先に出した成功のトーストの
// タイマーが、後から出したエラーのトーストを途中で消す。物件の保存は「更新しました」の直後にエラーを出すことがある）
let toastTimer = null;

/**
 * トースト通知を表示
 * @param {string} message - 表示メッセージ
 * @param {'info'|'success'|'error'|'warning'} [type='info'] - 通知タイプ
 */
export function showToast(message, type = 'info') {
    const toast = document.getElementById('toast');
    if (!toast) return;
    toast.textContent = message;
    toast.className = `toast ${type} show`;
    const duration = type === 'error' ? 5000 : 2500;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => {
        toast.classList.remove('show');
    }, duration);
}
