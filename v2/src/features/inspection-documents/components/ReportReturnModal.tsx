import { useState } from 'react';
import type { DbInspectionReport } from '@/types/portal';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { TextArea } from '@/components/ui/TextArea';

interface ReportReturnModalProps {
  report: DbInspectionReport | null;
  onClose: () => void;
  /** 理由を付けて差し戻す（呼び出し側が RPC を呼ぶ）。失敗したら reject してモーダルを残す */
  onSubmit: (report: DbInspectionReport, comment: string) => Promise<void>;
}

/** 報告書の差戻し（管理会社・管理者）。理由は保守会社の再提出画面に出るので必須 */
export function ReportReturnModal({ report, onClose, onSubmit }: ReportReturnModalProps) {
  const [comment, setComment] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [prevId, setPrevId] = useState<string | null>(null);
  if ((report?.id ?? null) !== prevId) {
    setPrevId(report?.id ?? null);
    setComment('');
    setError(null);
  }

  const handleSubmit = async () => {
    if (!report) return;
    if (!comment.trim()) {
      setError('差戻しの理由を入力してください');
      return;
    }
    setSaving(true);
    try {
      await onSubmit(report, comment.trim());
      onClose();
    } catch {
      // トーストは呼び出し側が出す
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      open={!!report}
      onClose={onClose}
      title="報告書の差戻し"
      dirty={!!comment.trim() && !saving}
      footer={
        <>
          <Button variant="secondary" size="sm" onClick={onClose} disabled={saving}>
            キャンセル
          </Button>
          <Button variant="danger" size="sm" onClick={() => void handleSubmit()} disabled={saving}>
            差し戻す
          </Button>
        </>
      }
    >
      {report && (
        <div className="space-y-2 text-sm">
          <p className="break-all text-xs text-gray-600">{report.file_name}</p>
          <TextArea
            label="差戻しの理由（必須。保守会社に表示されます）"
            id="report-return-comment"
            rows={3}
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            error={error ?? undefined}
          />
        </div>
      )}
    </Modal>
  );
}
