import { Modal } from '@/components/ui/Modal';

export interface BulkReportUploadModalProps {
  open: boolean;
  onClose: () => void;
  /** 対象の保守会社（管理者は選択中の会社、保守会社アカウントは自社） */
  vendorId: string | null;
  onUploaded?: () => void;
}

/** 複数物件をまとめた1つの PDF を、プレビューを見ながら区間に分けて点検ごとに登録する */
export function BulkReportUploadModal({ open, onClose }: BulkReportUploadModalProps) {
  return (
    <Modal open={open} onClose={onClose} title="報告書一括アップロード">
      <p className="text-sm text-gray-600">準備中です。</p>
    </Modal>
  );
}
