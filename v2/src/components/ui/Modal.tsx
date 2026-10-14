import { type ReactNode, useEffect, useRef } from 'react';
import { cn } from '@/lib/utils';

interface ModalProps {
  open: boolean;
  onClose: () => void;
  title?: string;
  children: ReactNode;
  className?: string;
}

export function Modal({ open, onClose, title, children, className }: ModalProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  // 押したのも背景のときだけ閉じる（入力欄の文字を選択したまま背景で離したときに閉じない）
  const pressedOnBackdrop = useRef(false);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open) {
      dialog.showModal();
    } else {
      dialog.close();
    }
  }, [open]);

  return (
    <dialog
      ref={dialogRef}
      onClose={onClose}
      // 背景（::backdrop）のクリックは dialog 自身への click になる。中身は内側の div が受けるので閉じない
      // （dialog に padding を付けると余白のクリックでも閉じるため p-0 のままにする）。v1: 各モーダルの overlay click
      onMouseDown={(e) => {
        pressedOnBackdrop.current = e.target === e.currentTarget;
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget && pressedOnBackdrop.current) onClose();
        pressedOnBackdrop.current = false;
      }}
      // m-auto: preflight と親の space-y-* が dialog 既定の margin:auto を消すので中央寄せを明示する
      // max-w-lg は呼び出し側が max-w-* を渡さないときだけ（cn は結合のみで、両方あると CSS の並び順で max-w-lg が勝つ）
      className={cn(
        'm-auto rounded-lg shadow-xl backdrop:bg-black/50 p-0 w-full',
        !/(^|\s)max-w-/.test(className ?? '') && 'max-w-lg',
        className,
      )}
    >
      <div className="p-6">
        {title && (
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-gray-900">{title}</h2>
            <button
              onClick={onClose}
              className="text-gray-400 hover:text-gray-600 text-xl leading-none"
            >
              &times;
            </button>
          </div>
        )}
        {children}
      </div>
    </dialog>
  );
}
