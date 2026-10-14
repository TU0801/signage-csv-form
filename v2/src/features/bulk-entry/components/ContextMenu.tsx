import { useEffect, useRef } from 'react';
import { cn } from '@/lib/utils';

interface ContextMenuItem {
  label: string;
  onClick: () => void | Promise<void>;
  disabled?: boolean;
  danger?: boolean;
  /** この項目の上に区切り線を入れる */
  divider?: boolean;
}

interface ContextMenuProps {
  x: number;
  y: number;
  items: ContextMenuItem[];
  onClose: () => void;
}

/** 行の右クリックメニュー。外側のクリック・Escape で閉じる。v1: js/bulk-modals.js createContextMenu */
export function ContextMenu({ x, y, items, onClose }: ContextMenuProps) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        onClose();
      }
    };
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };

    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleEscape);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [onClose]);

  return (
    <div
      ref={ref}
      className="fixed z-50 min-w-[160px] rounded-md border border-gray-200 bg-white py-1 shadow-lg"
      style={{ left: x, top: y }}
    >
      {items.map((item) => (
        <div key={item.label}>
          {item.divider && <div className="my-1 border-t border-gray-100" />}
          <button
            type="button"
            onClick={() => {
              onClose();
              void item.onClick();
            }}
            disabled={item.disabled}
            className={cn(
              'w-full px-4 py-1.5 text-left text-sm',
              item.disabled
                ? 'cursor-not-allowed text-gray-300'
                : item.danger
                  ? 'text-red-600 hover:bg-red-50'
                  : 'text-gray-700 hover:bg-gray-100',
            )}
          >
            {item.label}
          </button>
        </div>
      ))}
    </div>
  );
}
