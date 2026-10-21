import { useState } from 'react';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { TextArea } from '@/components/ui/TextArea';

interface SendBackDialogProps {
  open: boolean;
  /** 何を差し戻すか（物件・点検種別・対象月） */
  subject: string;
  onClose: () => void;
  /** 理由を付けて差し戻す。失敗したら throw（ダイアログは開いたまま） */
  onConfirm: (reason: string) => Promise<void>;
}

/** 申請の差戻し。理由は必須（保守会社が直すときに見る。DB 側も空の理由を受け付けない） */
export function SendBackDialog({ open, subject, onClose, onConfirm }: SendBackDialogProps) {
  const [reason, setReason] = useState('');
  const [error, setError] = useState('');
  const [sending, setSending] = useState(false);

  const close = () => {
    setReason('');
    setError('');
    onClose();
  };

  const submit = async () => {
    if (!reason.trim()) {
      setError('差戻しの理由を入力してください');
      return;
    }
    setSending(true);
    try {
      await onConfirm(reason.trim());
      close();
    } catch {
      // 失敗の知らせは呼び出し側がトーストで出す
    } finally {
      setSending(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={close}
      title="申請の差戻し"
      dirty={reason.trim() !== ''}
      footer={
        <>
          <Button variant="secondary" size="sm" onClick={close} disabled={sending}>
            キャンセル
          </Button>
          <Button variant="danger" size="sm" onClick={submit} disabled={sending}>
            差し戻す
          </Button>
        </>
      }
    >
      <div className="space-y-2">
        <p className="text-xs text-gray-600">{subject}</p>
        <TextArea
          label="差戻しの理由 *"
          rows={3}
          value={reason}
          error={error || undefined}
          onChange={(e) => {
            setReason(e.target.value);
            if (error) setError('');
          }}
        />
        <p className="text-xs text-gray-400">理由は保守会社の画面に表示されます。</p>
      </div>
    </Modal>
  );
}
