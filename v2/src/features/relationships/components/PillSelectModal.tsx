import { useState } from 'react';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { cn } from '@/lib/utils';

export interface PillOption {
  value: string;
  label: string;
}

interface PillSelectModalProps {
  open: boolean;
  title: string;
  description: string;
  options: PillOption[];
  onClose: () => void;
  onConfirm: (values: string[]) => void;
}

/** ピル型ボタンの複数選択モーダル（物件・点検種別の追加で共用） */
// v1: admin.html #buildingSelectModal / #inspectionSelectModal（v1.26.0 972273a）
export function PillSelectModal({
  open,
  title,
  description,
  options,
  onClose,
  onConfirm,
}: PillSelectModalProps) {
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const toggle = (value: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(value)) next.delete(value);
      else next.add(value);
      return next;
    });
  };

  const close = () => {
    setSelected(new Set());
    onClose();
  };

  const confirm = () => {
    // 選択肢の並び順で返す
    const values = options.filter((o) => selected.has(o.value)).map((o) => o.value);
    if (values.length === 0) return;
    setSelected(new Set());
    onConfirm(values);
  };

  return (
    <Modal open={open} onClose={close} title={title} className="max-w-xl">
      <p className="mb-4 text-sm text-gray-500">{description}</p>
      <div className="flex max-h-96 flex-wrap gap-2 overflow-y-auto">
        {options.map((o) => (
          <button
            key={o.value}
            type="button"
            aria-pressed={selected.has(o.value)}
            onClick={() => toggle(o.value)}
            className={cn(
              'rounded-full border px-3 py-1 text-sm',
              selected.has(o.value)
                ? 'border-blue-600 bg-blue-600 text-white'
                : 'border-gray-300 bg-white text-gray-700 hover:bg-gray-50',
            )}
          >
            {o.label}
          </button>
        ))}
      </div>
      <div className="mt-6 flex items-center justify-end gap-3">
        <span className="mr-auto text-sm text-gray-500">{selected.size}件選択中</span>
        <Button variant="secondary" size="sm" onClick={close}>
          キャンセル
        </Button>
        <Button size="sm" onClick={confirm} disabled={selected.size === 0}>
          追加
        </Button>
      </div>
    </Modal>
  );
}
