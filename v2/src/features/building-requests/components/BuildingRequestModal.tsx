import { Modal } from '@/components/ui/Modal';

export interface BuildingRequestModalProps {
  open: boolean;
  onClose: () => void;
  /** 既定の保守会社（管理者は選択中の会社、保守会社アカウントは自社） */
  vendorId: string | null;
  /** 既定の管理会社（管理会社フィルターの値） */
  managementCompanyId: string | null;
  onSubmitted?: () => void;
}

/** 点検登録フォームに無い建物を申請する。管理者が承認すると業務システムに物件ができる */
export function BuildingRequestModal({ open, onClose }: BuildingRequestModalProps) {
  return (
    <Modal open={open} onClose={onClose} title="建物追加 申請">
      <p className="text-sm text-gray-600">準備中です。</p>
    </Modal>
  );
}
