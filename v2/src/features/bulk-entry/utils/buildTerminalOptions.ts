import type { Terminal } from '@/types/database';

export function buildTerminalOptions(terminals: Terminal[]) {
  return terminals.map((t) => ({
    value: t.terminal_id,
    label: t.supplement ? `${t.terminal_id} (${t.supplement})` : t.terminal_id,
  }));
}
