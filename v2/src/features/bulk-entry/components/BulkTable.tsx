import { useState, useCallback, useRef, useEffect } from 'react';
import { flexRender } from '@tanstack/react-table';
import type { BulkRow, EntryFormData } from '@/types/app';
import { useBulkStore } from '@/stores/bulkStore';
import { useBulkTable } from '../hooks/useBulkTable';
import { useBulkDragDrop } from '../hooks/useBulkDragDrop';
import { ContextMenu } from './ContextMenu';
import { Badge } from '@/components/ui/Badge';
import { cn } from '@/lib/utils';

interface EditingCell {
  rowId: string;
  field: keyof EntryFormData;
}

interface BulkTableProps {
  onOpenRowDetail: (rowId: string) => void;
}

export function BulkTable({ onOpenRowDetail }: BulkTableProps) {
  const { table } = useBulkTable();
  const selectedIds = useBulkStore((s) => s.selectedIds);
  const toggleSelection = useBulkStore((s) => s.toggleSelection);
  const selectAll = useBulkStore((s) => s.selectAll);
  const clearSelection = useBulkStore((s) => s.clearSelection);
  const updateRow = useBulkStore((s) => s.updateRow);
  const addRow = useBulkStore((s) => s.addRow);
  const duplicateRows = useBulkStore((s) => s.duplicateRows);
  const removeRows = useBulkStore((s) => s.removeRows);
  const rows = useBulkStore((s) => s.rows);
  const { handleDragStart, handleDragOver, handleDrop, handleDragEnd, draggedRowId } =
    useBulkDragDrop();

  const [editingCell, setEditingCell] = useState<EditingCell | null>(null);
  const [editValue, setEditValue] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; rowId: string } | null>(null);

  const handleContextMenu = useCallback((e: React.MouseEvent, rowId: string) => {
    e.preventDefault();
    setContextMenu({ x: e.clientX, y: e.clientY, rowId });
  }, []);

  const allSelected = rows.length > 0 && selectedIds.size === rows.length;
  const someSelected = selectedIds.size > 0 && !allSelected;

  useEffect(() => {
    if (editingCell && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [editingCell]);

  const handleCellDoubleClick = useCallback(
    (rowId: string, field: keyof EntryFormData, currentValue: unknown) => {
      setEditingCell({ rowId, field });
      setEditValue(String(currentValue ?? ''));
    },
    [],
  );

  const commitEdit = useCallback(() => {
    if (!editingCell) return;
    updateRow(editingCell.rowId, { [editingCell.field]: editValue });
    setEditingCell(null);
    setEditValue('');
  }, [editingCell, editValue, updateRow]);

  const cancelEdit = useCallback(() => {
    setEditingCell(null);
    setEditValue('');
  }, []);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter') {
        commitEdit();
      } else if (e.key === 'Escape') {
        cancelEdit();
      }
    },
    [commitEdit, cancelEdit],
  );

  // Editable fields
  const editableFields: Set<string> = new Set([
    'propertyCode',
    'terminalId',
    'vendorName',
    'inspectionType',
    'startDate',
    'endDate',
    'displayStartDate',
    'displayEndDate',
    'remarks',
  ]);

  const headerGroups = table.getHeaderGroups();
  const tableRows = table.getRowModel().rows;

  if (rows.length === 0) {
    return (
      <div className="rounded-lg border-2 border-dashed border-gray-300 p-12 text-center">
        <p className="text-gray-500">
          「行追加」ボタンまたは「Excel貼り付け」で行を追加してください
        </p>
        <p className="mt-1 text-sm text-gray-400">
          ExcelやGoogleスプレッドシートからCtrl+Vで直接貼り付けることもできます
        </p>
      </div>
    );
  }

  return (
    <>
    <div className="overflow-x-auto rounded-lg border border-gray-200">
      <table className="w-full border-collapse text-sm">
        <thead>
          {headerGroups.map((headerGroup) => (
            <tr key={headerGroup.id} className="border-b bg-gray-50">
              {headerGroup.headers.map((header) => {
                if (header.id === 'select') {
                  return (
                    <th key={header.id} className="w-10 px-2 py-2">
                      <input
                        type="checkbox"
                        checked={allSelected}
                        ref={(el) => {
                          if (el) el.indeterminate = someSelected;
                        }}
                        onChange={() => {
                          if (allSelected) {
                            clearSelection();
                          } else {
                            selectAll();
                          }
                        }}
                        className="h-4 w-4 rounded border-gray-300"
                      />
                    </th>
                  );
                }
                return (
                  <th
                    key={header.id}
                    className="whitespace-nowrap px-3 py-2 text-left text-xs font-medium text-gray-600"
                    style={{ width: header.getSize() }}
                  >
                    {header.isPlaceholder
                      ? null
                      : flexRender(header.column.columnDef.header, header.getContext())}
                  </th>
                );
              })}
            </tr>
          ))}
        </thead>
        <tbody>
          {tableRows.map((row) => {
            const bulkRow = row.original;
            const isSelected = selectedIds.has(bulkRow._id);
            const isDragged = draggedRowId === bulkRow._id;

            return (
              <tr
                key={row.id}
                draggable
                onDragStart={handleDragStart(bulkRow._id)}
                onDragOver={handleDragOver}
                onDrop={handleDrop(bulkRow._id)}
                onDragEnd={handleDragEnd}
                onContextMenu={(e) => handleContextMenu(e, bulkRow._id)}
                className={cn(
                  'border-b transition-colors',
                  isSelected && 'bg-blue-50',
                  isDragged && 'opacity-50',
                  !bulkRow._isValid && !isSelected && 'bg-red-50',
                  'hover:bg-gray-50',
                )}
              >
                {row.getVisibleCells().map((cell) => {
                  const colId = cell.column.id;

                  // Checkbox column
                  if (colId === 'select') {
                    return (
                      <td key={cell.id} className="w-10 px-2 py-1.5 text-center">
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => toggleSelection(bulkRow._id)}
                          className="h-4 w-4 rounded border-gray-300"
                        />
                      </td>
                    );
                  }

                  // Drag handle column
                  if (colId === 'drag') {
                    return (
                      <td
                        key={cell.id}
                        className="w-8 cursor-grab px-1 py-1.5 text-center text-gray-400"
                        title="ドラッグして並び替え"
                      >
                        &#x2630;
                      </td>
                    );
                  }

                  // Status column
                  if (colId === 'status') {
                    return (
                      <td key={cell.id} className="px-3 py-1.5">
                        <Badge variant={bulkRow._isValid ? 'success' : 'danger'}>
                          {bulkRow._isValid ? 'OK' : 'NG'}
                        </Badge>
                      </td>
                    );
                  }

                  // Actions column
                  if (colId === 'actions') {
                    return (
                      <td key={cell.id} className="px-2 py-1.5 text-center">
                        <button
                          onClick={() => onOpenRowDetail(bulkRow._id)}
                          className="text-blue-600 hover:text-blue-800 text-xs"
                          title="詳細"
                        >
                          詳細
                        </button>
                      </td>
                    );
                  }

                  // Row number column
                  if (colId === 'rowNumber') {
                    return (
                      <td key={cell.id} className="px-3 py-1.5 text-gray-400 text-xs">
                        {row.index + 1}
                      </td>
                    );
                  }

                  // Editable cells
                  const field = colId as keyof EntryFormData;
                  const isEditable = editableFields.has(field);
                  const isEditing =
                    editingCell?.rowId === bulkRow._id && editingCell?.field === field;
                  const cellValue = bulkRow[field as keyof BulkRow];
                  const hasError = !!bulkRow._errors[field];

                  if (isEditing) {
                    return (
                      <td key={cell.id} className="px-1 py-0.5">
                        <input
                          ref={inputRef}
                          type={field.includes('Date') ? 'date' : 'text'}
                          value={editValue}
                          onChange={(e) => setEditValue(e.target.value)}
                          onBlur={commitEdit}
                          onKeyDown={handleKeyDown}
                          className="w-full rounded border border-blue-400 px-2 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
                        />
                      </td>
                    );
                  }

                  return (
                    <td
                      key={cell.id}
                      className={cn(
                        'whitespace-nowrap px-3 py-1.5',
                        isEditable && 'cursor-pointer hover:bg-blue-50',
                        hasError && 'text-red-600',
                      )}
                      onDoubleClick={
                        isEditable
                          ? () => handleCellDoubleClick(bulkRow._id, field, cellValue)
                          : undefined
                      }
                      title={hasError ? bulkRow._errors[field] : undefined}
                    >
                      <span className="block max-w-[200px] truncate">
                        {String(cellValue ?? '')}
                      </span>
                      {hasError && (
                        <span className="text-[10px] text-red-500">{bulkRow._errors[field]}</span>
                      )}
                    </td>
                  );
                })}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>

    {contextMenu && (
      <ContextMenu
        x={contextMenu.x}
        y={contextMenu.y}
        onClose={() => setContextMenu(null)}
        items={[
          {
            label: '複製',
            onClick: () => duplicateRows([contextMenu.rowId]),
          },
          {
            label: '上に行を挿入',
            onClick: () => addRow(),
          },
          {
            label: '詳細を開く',
            onClick: () => onOpenRowDetail(contextMenu.rowId),
          },
          {
            label: '削除',
            danger: true,
            onClick: () => removeRows([contextMenu.rowId]),
          },
        ]}
      />
    )}
    </>
  );
}
