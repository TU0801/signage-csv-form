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
