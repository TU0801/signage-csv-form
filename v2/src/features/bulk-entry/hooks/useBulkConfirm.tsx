import { useCallback, useState } from 'react';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';

interface PendingConfirm {
  message: string;
  resolve: (ok: boolean) => void;
}

/**
 * v1 の window.confirm の置き換え。`await confirm('…')` で OK なら true、キャンセル・閉じるなら false。
 * 返す dialog を画面のどこかに置く。
 */
export function useBulkConfirm() {
  const [pending, setPending] = useState<PendingConfirm | null>(null);

  const confirm = useCallback(
    (message: string) => new Promise<boolean>((resolve) => setPending({ message, resolve })),
    [],
  );

  const finish = (ok: boolean) => {
    pending?.resolve(ok);
    setPending(null);
  };

  const dialog = (
    <Modal open={!!pending} onClose={() => finish(false)} title="確認">
      <p className="mb-6 whitespace-pre-line text-sm text-gray-600">{pending?.message}</p>
      <div className="flex justify-end gap-3">
        <Button variant="secondary" onClick={() => finish(false)}>
          キャンセル
        </Button>
        <Button onClick={() => finish(true)}>OK</Button>
      </div>
    </Modal>
  );

  return { confirm, dialog };
}
