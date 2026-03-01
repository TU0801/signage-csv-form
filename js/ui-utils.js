/**
 * UI共通ユーティリティ（ESモジュール）
 * admin.js, admin-masters.js 等で共有する関数を集約。
 */

/**
 * HTMLエスケープ（XSS防止）
 * @param {*} str - エスケープ対象の値
 * @returns {string} エスケープ済み文字列
 */
export function escapeHtml(str) {
    if (str === null || str === undefined) return '';
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

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
    setTimeout(() => {
        toast.classList.remove('show');
    }, 2500);
}
