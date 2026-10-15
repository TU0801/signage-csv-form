import type { Terminal } from '@/types/database';

interface TerminalListProps {
  value: Terminal[];
}

/**
 * 端末リスト（読み取り専用）。端末の正本は業務システムの物件で、biz のトリガーが写す（2026-10-15）。
 * 端末が無い物件（サイネージ未設置）は「端末なし」と出す。
 */
// v1: js/admin-masters.js addTerminalField（readonly）/ admin.html #terminalsList
export function TerminalList({ value }: TerminalListProps) {
  return (
    <div className="space-y-1">
      <span className="block text-xs font-medium text-gray-600">端末リスト（業務システムの物件の端末）</span>
      {value.length === 0 ? (
        <p className="rounded-md border border-gray-200 bg-gray-50 px-2 py-1.5 text-sm text-gray-500">端末なし</p>
      ) : (
        <ul className="space-y-1" aria-label="端末リスト">
          {value.map((terminal, index) => (
            <li
              key={index}
              className="flex gap-2 rounded-md border border-gray-200 bg-gray-50 px-2 py-1.5 text-sm text-gray-700"
            >
              <span className="font-mono">{terminal.terminal_id}</span>
              {terminal.supplement && <span className="text-gray-500">{terminal.supplement}</span>}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
