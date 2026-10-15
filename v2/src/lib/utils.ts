/** Tailwind class merge helper (simple version) */
export function cn(...classes: (string | false | null | undefined)[]): string {
  return classes.filter(Boolean).join(' ');
}

/** XSS防止用HTMLエスケープ */
export function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

/**
 * 今日（YYYY-MM-DD）。v1 と同じく UTC の日付（`new Date().toISOString().split('T')[0]`）。
 * そのため日本時間 0〜9 時は前日になる（v1 の不具合候補。v1 と同じ結果を保つため直さない）。
 */
export function todayUtc(now: Date = new Date()): string {
  return now.toISOString().split('T')[0]!;
}

/**
 * 画面にリンクとして出してよい URL か。http(s)・mailto・tel・/ で始まる相対 URL だけを許す。
 * javascript: や data: を href に入れると押した人のブラウザでスクリプトが動くため（保存済みの値も含めて表示側で止める）。
 */
export function isSafeLinkUrl(url: string | null | undefined): boolean {
  const trimmed = (url ?? '').trim();
  if (!trimmed) return false;
  return /^(https?:\/\/|mailto:|tel:)/i.test(trimmed) || (trimmed.startsWith('/') && !trimmed.startsWith('//'));
}

/**
 * 検索用の文字列の正規化。全角・半角（NFKC）、大文字・小文字、空白、ひらがな・カタカナの違いを無視する。
 * 業務システム（BARAN）の lib/ui/search-select.ts normSearch と同じ規則。
 */
export function normalizeSearch(str: string): string {
  return str
    .normalize('NFKC')
    .toLowerCase()
    .replace(/\s+/g, '')
    .replace(/[ぁ-ゖ]/g, (c) => String.fromCharCode(c.charCodeAt(0) + 0x60));
}
