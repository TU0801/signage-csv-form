import type { Terminal } from '@/types/database';

export function buildTerminalOptions(terminals: Terminal[]) {
  return terminals.map((t) => ({
    value: t.id,
    label: t.supplement ? `${t.id} (${t.supplement})` : t.id,
  }));
}
