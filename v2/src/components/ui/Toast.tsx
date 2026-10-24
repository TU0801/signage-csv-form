import { useState, useCallback, createContext, useContext, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { cn } from '@/lib/utils';
import type { Toast as ToastType } from '@/types/app';
import { useTopLayerHost } from './topLayerHost';

interface ToastContextValue {
  addToast: (message: string, type?: ToastType['type']) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used within ToastProvider');
  return ctx;
}

/** 同時に表示する数の上限。積み重なって画面の下の表や操作を覆いすぎないようにする */
const MAX_VISIBLE_TOASTS = 3;

/** 成功・お知らせが自動で消えるまで。エラー・警告は読み落とさないよう × で閉じるまで残す */
const AUTO_DISMISS_MS = 4000;

const typeStyles = {
  info: 'bg-blue-50 text-blue-800 border-blue-200',
  success: 'bg-green-50 text-green-800 border-green-200',
  error: 'bg-red-50 text-red-800 border-red-200',
  warning: 'bg-yellow-50 text-yellow-800 border-yellow-200',
};

/**
 * トースト通知。addToast(message, type) で出す。message の '\n' は改行として表示する。
 * success / info は 4 秒で消え、error / warning は × を押すまで残る（最新 3 件まで。超えた古いものは消える）。
 * モーダルが開いているときは一番手前の dialog の中に portal する。外に出すと inert になり、押すと背景クリックでモーダルが閉じる。
 * dialog の子孫なので dialog と一緒に top layer に乗り、::backdrop の上に出る（popover は使わない）。
 * dialog が外れたら topLayerHost の通知で次の dialog か body へ移る。DOM を直接操作しないので、
 * 外れた直後の dialog（DOM から切り離されたもの）へ一瞬描いても例外にならない。
 */
export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastType[]>([]);
  const host = useTopLayerHost();

  const addToast = useCallback((message: string, type: ToastType['type'] = 'info') => {
    const id = crypto.randomUUID();
    setToasts((prev) => [...prev, { id, message, type }].slice(-MAX_VISIBLE_TOASTS));
    if (type === 'success' || type === 'info') {
      setTimeout(() => {
        setToasts((prev) => prev.filter((t) => t.id !== id));
      }, AUTO_DISMISS_MS);
    }
  }, []);

  const removeToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const container = (
    // fixed は viewport 基準（dialog に transform は無い）。モーダルの中では右上の×や右下の保存ボタンを覆わないよう上の中央に、
    // モーダルが無いときは下の中央に出す。エラーは閉じるまで残るので、右上だと一括入力のツールバー右端（時期・検索・テンプレート）を、
    // 右下だと下端の CSV ボタンを、左下だと「申請する」を覆う（修正依頼1024 F4）
    <div
      data-testid="toast-container"
      className={cn(
        'fixed z-[1000] max-w-md space-y-2 left-1/2 -translate-x-1/2',
        host ? 'top-2' : 'bottom-4',
      )}
    >
      {toasts.map((toast) => (
        <div
          key={toast.id}
          role={toast.type === 'error' || toast.type === 'warning' ? 'alert' : 'status'}
          className={cn(
            'flex items-start gap-2 rounded-md border px-3 py-2 shadow-sm text-sm',
            typeStyles[toast.type],
          )}
        >
          <span className="flex-1 whitespace-pre-line">{toast.message}</span>
          <button
            type="button"
            aria-label="閉じる"
            onClick={() => removeToast(toast.id)}
            className="text-current leading-none opacity-50 hover:opacity-100"
          >
            &times;
          </button>
        </div>
      ))}
    </div>
  );

  return (
    <ToastContext.Provider value={{ addToast }}>
      {children}
      {createPortal(container, host ?? document.body)}
    </ToastContext.Provider>
  );
}
