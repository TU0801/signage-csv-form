import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import type { Terminal } from '@/types/database';

interface TerminalEditorProps {
  value: Terminal[];
  onChange: (terminals: Terminal[]) => void;
}

/**
 * 端末リスト（任意。サイネージ未設置の物件は空欄）。どの行も消せる。新しい行は空欄で足す。
 * 端末IDが空の行は保存のときに捨てる（collectTerminals）。
 */
// v1: js/admin-masters.js addTerminalField / admin.html #terminalsList
export function TerminalEditor({ value, onChange }: TerminalEditorProps) {
  const update = (index: number, field: keyof Terminal, val: string) =>
    onChange(value.map((t, i) => (i === index ? { ...t, [field]: val } : t)));

  return (
    <div className="space-y-2">
      <span className="block text-sm font-medium text-gray-700">
        端末リスト（サイネージ未設置の場合は空欄）
      </span>
      {value.map((terminal, index) => (
        <div key={index} className="flex items-center gap-2">
          <div className="flex-1">
            <Input
              aria-label={`端末ID ${index + 1}`}
              placeholder="端末ID"
              value={terminal.terminal_id}
              onChange={(e) => update(index, 'terminal_id', e.target.value)}
            />
          </div>
          <div className="flex-1">
            <Input
              aria-label={`補足 ${index + 1}`}
              placeholder="補足（任意）"
              value={terminal.supplement}
              onChange={(e) => update(index, 'supplement', e.target.value)}
            />
          </div>
          <Button
            variant="danger"
            size="sm"
            type="button"
            onClick={() => onChange(value.filter((_, i) => i !== index))}
          >
            削除
          </Button>
        </div>
      ))}
      <Button
        variant="secondary"
        size="sm"
        type="button"
        onClick={() => onChange([...value, { terminal_id: '', supplement: '' }])}
      >
        + 端末を追加
      </Button>
    </div>
  );
}
