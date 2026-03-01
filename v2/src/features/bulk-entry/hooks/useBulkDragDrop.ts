import { useCallback, type DragEvent } from 'react';
import { useBulkStore } from '@/stores/bulkStore';

/**
 * ドラッグ&ドロップによる行並び替えフック
 */
export function useBulkDragDrop() {
  const rows = useBulkStore((s) => s.rows);
  const reorderRows = useBulkStore((s) => s.reorderRows);
  const setDraggedRowId = useBulkStore((s) => s.setDraggedRowId);
  const draggedRowId = useBulkStore((s) => s.draggedRowId);

  const handleDragStart = useCallback(
    (rowId: string) => (e: DragEvent<HTMLTableRowElement>) => {
      setDraggedRowId(rowId);
      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData('text/plain', rowId);
    },
    [setDraggedRowId],
  );

  const handleDragOver = useCallback((e: DragEvent<HTMLTableRowElement>) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
  }, []);

  const handleDrop = useCallback(
    (targetRowId: string) => (e: DragEvent<HTMLTableRowElement>) => {
      e.preventDefault();
      if (!draggedRowId || draggedRowId === targetRowId) {
        setDraggedRowId(null);
        return;
      }

      const fromIndex = rows.findIndex((r) => r._id === draggedRowId);
      const toIndex = rows.findIndex((r) => r._id === targetRowId);

      if (fromIndex !== -1 && toIndex !== -1) {
        reorderRows(fromIndex, toIndex);
      }

      setDraggedRowId(null);
    },
    [draggedRowId, rows, reorderRows, setDraggedRowId],
  );

  const handleDragEnd = useCallback(() => {
    setDraggedRowId(null);
  }, [setDraggedRowId]);

  return {
    draggedRowId,
    handleDragStart,
    handleDragOver,
    handleDrop,
    handleDragEnd,
  };
}
