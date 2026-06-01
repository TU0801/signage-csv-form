// shared-utils.js - 複数ファイルで共通利用するユーティリティ（ES Module）

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
 * CSV 28列ヘッダー定数
 */
export const CSV_HEADERS = [
    '点検CO', '端末ID', '物件コード', '受注先名', '緊急連絡先番号',
    '点検工事案内', '掲示板に表示する', '点検案内TPLNo', '点検開始日',
    '点検完了日', '掲示備考', '掲示板用案内文', 'frame_No', '表示開始日',
    '表示終了日', '表示開始時刻', '表示終了時刻', '表示時間', '統合ポリシー',
    '制御', '変更日', '変更時刻', '最終エクスポート日時', 'ID', '変更日時',
    '点検日時', '表示日時', '貼紙区分'
];

/**
 * CSV値のエスケープ（カンマ・ダブルクォート・改行を含む場合にクォート）
 * @param {*} v
 * @returns {string}
 */
export function escapeCSVField(v) {
    if (v == null) return '';
    const s = String(v);
    return (s.includes(',') || s.includes('"') || s.includes('\n')) ? '"' + s.replace(/"/g, '""') + '"' : s;
}

/**
 * terminal_id を正規化する
 * JSON文字列・オブジェクトの場合は terminalId/terminal_id/id を抽出
 * @param {*} terminalId
 * @returns {string}
 */
export function normalizeTerminalId(terminalId) {
    if (!terminalId) return '';
    if (typeof terminalId === 'string') {
        if (terminalId.startsWith('{')) {
            try {
                const parsed = JSON.parse(terminalId);
                return parsed.terminalId || parsed.terminal_id || parsed.id || terminalId;
            } catch (_e) {
                return terminalId;
            }
        }
        return terminalId;
    }
    if (typeof terminalId === 'object') {
        return terminalId.terminalId || terminalId.terminal_id || terminalId.id || '';
    }
    return String(terminalId);
}
