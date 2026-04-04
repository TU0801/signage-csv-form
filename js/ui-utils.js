/**
 * UI共通ユーティリティ（ESモジュール）
 * admin.js, admin-masters.js 等で共有する関数を集約。
 */

// escapeHtml は shared-utils.js に移動。後方互換のため re-export
export { escapeHtml } from './shared-utils.js';

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
    setTimeout(() => {
        toast.classList.remove('show');
    }, duration);
}
