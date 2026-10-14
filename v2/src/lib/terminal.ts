import type { DbTerminal, Terminal } from '@/types/database';

/**
 * terminal_id を正規化する。JSON文字列・オブジェクトの場合は terminalId / terminal_id / id を取り出す
 * （signage_entries.terminal_id に JSON 文字列が入っている行がある）。
 * v1: js/shared-utils.js normalizeTerminalId
 */
export function normalizeTerminalId(terminalId: unknown): string {
  if (!terminalId) return '';
  if (typeof terminalId === 'string') {
    if (terminalId.startsWith('{')) {
      try {
        const parsed = JSON.parse(terminalId) as Record<string, unknown>;
        return String(parsed.terminalId || parsed.terminal_id || parsed.id || terminalId);
      } catch {
        return terminalId;
      }
    }
    return terminalId;
  }
  if (typeof terminalId === 'object') {
    const t = terminalId as Record<string, unknown>;
    return String(t.terminalId || t.terminal_id || t.id || '');
  }
  return String(terminalId);
}

/**
 * terminals jsonb の1要素を画面で使う形にする（terminalId / terminal_id の混在を吸収）。
 * v1: js/supabase/master-data.js getAllMasterData の terminals 変換
 */
export function toTerminal(t: DbTerminal): Terminal {
  return { terminal_id: normalizeTerminalId(t), supplement: t.supplement || '' };
}
