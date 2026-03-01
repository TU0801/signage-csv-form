import { ConfirmDialog } from '@/components/ui/ConfirmDialog';

interface MasterDeleteConfirmProps {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
  displayName: string;
  itemLabel?: string;
}

export function MasterDeleteConfirm({
  open,
  onClose,
  onConfirm,
  displayName,
  itemLabel,
}: MasterDeleteConfirmProps) {
  const message = itemLabel
    ? `「${itemLabel}」を削除しますか？この操作は元に戻せません。`
    : `この${displayName}を削除しますか？この操作は元に戻せません。`;

  return (
    <ConfirmDialog
      open={open}
      onClose={onClose}
      onConfirm={onConfirm}
      title={`${displayName}の削除`}
      message={message}
      confirmLabel="削除"
      variant="danger"
    />
  );
}
