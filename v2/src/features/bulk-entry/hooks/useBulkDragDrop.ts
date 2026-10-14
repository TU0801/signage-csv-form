import { useCallback, useState, type DragEvent } from 'react';
import { useBulkStore } from '@/stores/bulkStore';
import { useToast } from '@/components/ui/Toast';

/**
 * ドラッグ&ドロップで行を並べ替える。
 * v1: js/bulk-table.js handleDragStart / handleDragOver / handleDrop / handleDragEnd
 */
export function useBulkDragDrop() {
  const { addToast } = useToast();
  const reorderRows = useBulkStore((s) => s.reorderRows);
  const setDraggedRowId = useBulkStore((s) => s.setDraggedRowId);
  const draggedRowId = useBulkStore((s) => s.draggedRowId);
  const [dragOverRowId, setDragOverRowId] = useState<number | null>(null);

  const handleDragStart = useCallback(
    (rowId: number) => (e: DragEvent<HTMLTableRowElement>) => {
      setDraggedRowId(rowId);
      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData('text/plain', String(rowId));
    },
    [setDraggedRowId],
  );

  const handleDragOver = useCallback(
    (rowId: number) => (e: DragEvent<HTMLTableRowElement>) => {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
      setDragOverRowId(rowId);
    },
    [],
  );

  const handleDrop = useCallback(
    (targetRowId: number) => (e: DragEvent<HTMLTableRowElement>) => {
      e.preventDefault();
      if (draggedRowId === null || draggedRowId === targetRowId) return;
      reorderRows(draggedRowId, targetRowId);
      addToast('行の順序を変更しました', 'success');
    },
    [draggedRowId, reorderRows, addToast],
  );

  const handleDragEnd = useCallback(() => {
    setDraggedRowId(null);
    setDragOverRowId(null);
  }, [setDraggedRowId]);

  return { draggedRowId, dragOverRowId, handleDragStart, handleDragOver, handleDrop, handleDragEnd };
}
