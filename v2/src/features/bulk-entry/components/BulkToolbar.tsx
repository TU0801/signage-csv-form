import { useState } from 'react';
import { Button } from '@/components/ui/Button';
import { useBulkStore } from '@/stores/bulkStore';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';

interface BulkToolbarProps {
  onOpenPaste: () => void;
  onOpenBulkEdit: () => void;
}

export function BulkToolbar({ onOpenPaste, onOpenBulkEdit }: BulkToolbarProps) {
  const addRow = useBulkStore((s) => s.addRow);
  const selectedIds = useBulkStore((s) => s.selectedIds);
  const duplicateRows = useBulkStore((s) => s.duplicateRows);
  const removeRows = useBulkStore((s) => s.removeRows);
  const clearAll = useBulkStore((s) => s.clearAll);
  const rows = useBulkStore((s) => s.rows);
  const [showClearConfirm, setShowClearConfirm] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  const selectedArray = [...selectedIds];
  const hasSelection = selectedArray.length > 0;

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Button size="sm" onClick={() => addRow()}>
        + 行追加
      </Button>
      <Button size="sm" variant="secondary" onClick={onOpenPaste}>
        Excel貼り付け
      </Button>

      {hasSelection && (
        <>
          <div className="h-5 w-px bg-gray-300" />
          <Button
            size="sm"
            variant="secondary"
            onClick={() => duplicateRows(selectedArray)}
          >
            複製 ({selectedArray.length})
          </Button>
          <Button size="sm" variant="secondary" onClick={onOpenBulkEdit}>
            一括編集 ({selectedArray.length})
          </Button>
          <Button
            size="sm"
            variant="danger"
            onClick={() => setShowDeleteConfirm(true)}
          >
            削除 ({selectedArray.length})
          </Button>
        </>
      )}

      {rows.length > 0 && (
        <>
          <div className="flex-1" />
          <Button
            size="sm"
            variant="ghost"
            onClick={() => setShowClearConfirm(true)}
          >
            全クリア
          </Button>
        </>
      )}

      <ConfirmDialog
        open={showDeleteConfirm}
        onClose={() => setShowDeleteConfirm(false)}
        onConfirm={() => removeRows(selectedArray)}
        title="行の削除"
        message={`選択した${selectedArray.length}件を削除しますか？`}
        confirmLabel="削除"
        variant="danger"
      />

      <ConfirmDialog
        open={showClearConfirm}
        onClose={() => setShowClearConfirm(false)}
        onConfirm={() => clearAll()}
        title="全データクリア"
        message="全ての行を削除しますか？この操作は元に戻せません。"
        confirmLabel="全クリア"
        variant="danger"
      />
    </div>
  );
}
