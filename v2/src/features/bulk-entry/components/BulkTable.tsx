import { useCallback, useMemo, useState, type KeyboardEvent } from 'react';
import { useBulkStore } from '@/stores/bulkStore';
import { useToast } from '@/components/ui/Toast';
import { Badge } from '@/components/ui/Badge';
import { cn } from '@/lib/utils';
import { useBulkDragDrop } from '../hooks/useBulkDragDrop';
import { terminalIdsFor, uniqueProperties } from '../utils/bulkMaster';
import { ContextMenu } from './ContextMenu';
import { SearchableSelect } from './SearchableSelect';
import type { BulkEntryRow } from '../types';

interface BulkTableProps {
  onOpenRowDetail: (rowId: number) => void;
  confirm: (message: string) => Promise<boolean>;
}

/** セル内の入力欄の列番号（Enter で次の列へ、Alt+↑↓ で同じ列の前後の行へ） */
const COL = { property: 0, terminal: 1, inspection: 2, startDate: 3, endDate: 4, remarks: 5 } as const;
const LAST_COL = COL.remarks;

const cellInput =
  'block w-full rounded border border-gray-300 px-2 py-1 text-sm focus:border-blue-500 focus:outline-none';

function focusCell(tr: Element | null | undefined, col: number) {
  const el = tr?.querySelector<HTMLElement>(`[data-col="${col}"]`);
  el?.focus();
  return !!el;
}

/** 検索付きセレクトで選んだら次の列へ（v1 setupSearchableSelect の change） */
function focusNextOf(rowId: number, col: number) {
  setTimeout(() => focusCell(document.querySelector(`tr[data-row-id="${rowId}"]`), col + 1), 0);
}

/**
 * 一括入力の表。行ごとに物件（検索付き）・端末・点検種別（検索付き）・点検日・備考を直接編集する。
 * v1: js/bulk-table.js renderRow / setupRowEventListeners / handleCellKeyDown
 */
export function BulkTable({ onOpenRowDetail, confirm }: BulkTableProps) {
  const { addToast } = useToast();
  const rows = useBulkStore((s) => s.rows);
  const filter = useBulkStore((s) => s.filter);
  const masterData = useBulkStore((s) => s.masterData);
  const selectedIds = useBulkStore((s) => s.selectedIds);
  const toggleSelection = useBulkStore((s) => s.toggleSelection);
  const selectAll = useBulkStore((s) => s.selectAll);
  const clearSelection = useBulkStore((s) => s.clearSelection);
  const updateRow = useBulkStore((s) => s.updateRow);
  const changeProperty = useBulkStore((s) => s.changeProperty);
  const changeStartDate = useBulkStore((s) => s.changeStartDate);
  const changeRemarks = useBulkStore((s) => s.changeRemarks);
  const addRowWithCopy = useBulkStore((s) => s.addRowWithCopy);
  const duplicateRowFromMenu = useBulkStore((s) => s.duplicateRowFromMenu);
  const pasteCopiedRow = useBulkStore((s) => s.pasteCopiedRow);
  const copyRow = useBulkStore((s) => s.copyRow);
  const insertRowAt = useBulkStore((s) => s.insertRowAt);
  const removeRows = useBulkStore((s) => s.removeRows);
  const { handleDragStart, handleDragOver, handleDrop, handleDragEnd, draggedRowId, dragOverRowId } =
    useBulkDragDrop();
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; rowId: number } | null>(null);

  const propertyOptions = useMemo(
    () =>
      uniqueProperties(masterData.properties).map((p) => ({
        value: p.propertyCode,
        label: `${p.propertyCode} ${p.propertyName}`,
      })),
    [masterData.properties],
  );
  const inspectionOptions = useMemo(
    () => masterData.notices.map((n) => ({ value: n.inspectionType, label: n.inspectionType })),
    [masterData.notices],
  );

  const allSelected = rows.length > 0 && rows.every((r) => selectedIds.has(r.id));

  const isVisible = (row: BulkEntryRow) =>
    filter === 'all' || (filter === 'valid' ? row.isValid : !row.isValid);

  // v1: js/bulk-table.js handleCellKeyDown
  const handleCellKeyDown = useCallback(
    (e: KeyboardEvent<HTMLElement>, rowIndex: number, col: number) => {
      const tr = e.currentTarget.closest('tr');
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        if (col < LAST_COL) {
          focusCell(tr, col + 1);
        } else if (rowIndex === rows.length - 1) {
          addRowWithCopy();
        }
        return;
      }
      if (e.key === 'ArrowDown' && e.altKey) {
        e.preventDefault();
        focusCell(tr?.nextElementSibling, col);
        return;
      }
      if (e.key === 'ArrowUp' && e.altKey) {
        e.preventDefault();
        focusCell(tr?.previousElementSibling, col);
      }
    },
    [rows.length, addRowWithCopy],
  );

  // v1: js/bulk-modals.js handleContextMenuAction
  const contextItems = (rowId: number) => {
    const rowIndex = rows.findIndex((r) => r.id === rowId);
    return [
      {
        label: 'この行を複製',
        onClick: () => {
          if (duplicateRowFromMenu(rowId)) addToast('行を複製しました', 'success');
        },
      },
      {
        label: '上に行を挿入',
        onClick: () => {
          insertRowAt(rowIndex);
          addToast('行を挿入しました', 'success');
        },
      },
      {
        label: '下に行を挿入',
        onClick: () => {
          insertRowAt(rowIndex + 1);
          addToast('行を挿入しました', 'success');
        },
      },
      {
        label: 'この行をコピー',
        divider: true,
        onClick: () => {
          copyRow(rowId);
          addToast('行をコピーしました', 'success');
        },
      },
      {
        label: 'ペースト',
        onClick: () => {
          if (pasteCopiedRow()) addToast('行をペーストしました', 'success');
          else addToast('コピーされた行がありません', 'error');
        },
      },
      { label: '全て選択', divider: true, onClick: selectAll },
      { label: '選択解除', onClick: clearSelection },
      {
        label: 'この行を削除',
        divider: true,
        danger: true,
        onClick: async () => {
          if (rowIndex === -1) return;
          if (await confirm('この行を削除しますか？')) {
            removeRows([rowId]);
            addToast('行を削除しました', 'success');
          }
        },
      },
    ];
  };

  return (
    <>
      <table className="w-full border-collapse text-sm">
        <thead className="sticky top-0 z-10 bg-gray-50">
          <tr className="border-b">
            <th className="w-10 px-2 py-2">
              <input
                type="checkbox"
                title="すべて選択"
                checked={allSelected}
                onChange={(e) => (e.target.checked ? selectAll() : clearSelection())}
                className="h-4 w-4 rounded border-gray-300"
              />
            </th>
            <th className="w-10 px-2 py-2 text-left text-xs font-medium text-gray-600">No</th>
            <th className="min-w-[14rem] px-2 py-2 text-left text-xs font-medium text-gray-600">
              物件<span className="text-red-500">*</span>
            </th>
            <th className="min-w-[8rem] px-2 py-2 text-left text-xs font-medium text-gray-600">端末</th>
            <th className="min-w-[12rem] px-2 py-2 text-left text-xs font-medium text-gray-600">
              点検種別<span className="text-red-500">*</span>
            </th>
            <th className="px-2 py-2 text-left text-xs font-medium text-gray-600">点検開始日</th>
            <th className="px-2 py-2 text-left text-xs font-medium text-gray-600">点検終了日</th>
            <th className="min-w-[10rem] px-2 py-2 text-left text-xs font-medium text-gray-600">備考</th>
            <th className="w-12 px-2 py-2 text-center text-xs font-medium text-gray-600">詳細</th>
            <th className="w-16 px-2 py-2 text-center text-xs font-medium text-gray-600">状態</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row, index) => {
            if (!isVisible(row)) return null;
            const terminalIds = terminalIdsFor(masterData.properties, row.propertyCode);
            const hasDetail = !!(row.noticeText || row.displayStartDate);
            return (
              <tr
                key={row.id}
                data-row-id={row.id}
                draggable
                onDragStart={handleDragStart(row.id)}
                onDragOver={handleDragOver(row.id)}
                onDrop={handleDrop(row.id)}
                onDragEnd={handleDragEnd}
                onContextMenu={(e) => {
                  e.preventDefault();
                  setContextMenu({ x: e.clientX, y: e.clientY, rowId: row.id });
                }}
                className={cn(
                  'border-b align-top',
                  selectedIds.has(row.id) && 'bg-blue-50',
                  draggedRowId === row.id && 'opacity-50',
                  dragOverRowId === row.id && draggedRowId !== row.id && 'border-t-2 border-t-blue-500',
                )}
              >
                <td className="px-2 py-1.5 text-center">
                  <input
                    type="checkbox"
                    checked={selectedIds.has(row.id)}
                    onChange={() => toggleSelection(row.id)}
                    className="h-4 w-4 rounded border-gray-300"
                  />
                </td>
                <td className="px-2 py-1.5 text-xs text-gray-400">{index + 1}</td>
                <td className="px-2 py-1">
                  <SearchableSelect
                    value={row.propertyCode}
                    options={propertyOptions}
                    placeholder="-- 物件を選択 --"
                    searchPlaceholder="物件名で検索..."
                    onChange={(v) => changeProperty(row.id, v)}
                    onPicked={() => focusNextOf(row.id, COL.property)}
                    dataCol={COL.property}
                    onKeyDown={(e) => handleCellKeyDown(e, index, COL.property)}
                  />
                </td>
                <td className="px-2 py-1">
                  <select
                    data-col={COL.terminal}
                    value={row.terminalId}
                    onChange={(e) => updateRow(row.id, { terminalId: e.target.value })}
                    onKeyDown={(e) => handleCellKeyDown(e, index, COL.terminal)}
                    className={cellInput}
                  >
                    <option value="">-- 端末 --</option>
                    {terminalIds.map((id) => (
                      <option key={id} value={id}>
                        {id}
                      </option>
                    ))}
                  </select>
                </td>
                <td className="px-2 py-1">
                  <SearchableSelect
                    value={row.inspectionType}
                    options={inspectionOptions}
                    placeholder="-- 点検種別を選択 --"
                    searchPlaceholder="点検種別で検索..."
                    onChange={(v) => updateRow(row.id, { inspectionType: v })}
                    onPicked={() => focusNextOf(row.id, COL.inspection)}
                    dataCol={COL.inspection}
                    onKeyDown={(e) => handleCellKeyDown(e, index, COL.inspection)}
                  />
                </td>
                <td className="px-2 py-1">
                  <input
                    type="date"
                    data-col={COL.startDate}
                    title="点検開始日"
                    value={row.startDate}
                    onChange={(e) => changeStartDate(row.id, e.target.value)}
                    onKeyDown={(e) => handleCellKeyDown(e, index, COL.startDate)}
                    className={cellInput}
                  />
                </td>
                <td className="px-2 py-1">
                  <input
                    type="date"
                    data-col={COL.endDate}
                    title="点検終了日"
                    value={row.endDate}
                    onChange={(e) => updateRow(row.id, { endDate: e.target.value })}
                    onKeyDown={(e) => handleCellKeyDown(e, index, COL.endDate)}
                    className={cellInput}
                  />
                </td>
                <td className="px-2 py-1">
                  <input
                    type="text"
                    data-col={COL.remarks}
                    value={row.remarks}
                    placeholder="任意入力"
                    maxLength={125}
                    title="1行25文字×5行まで"
                    onChange={(e) => changeRemarks(row.id, e.target.value)}
                    onKeyDown={(e) => handleCellKeyDown(e, index, COL.remarks)}
                    className={cellInput}
                  />
                </td>
                <td className="px-2 py-1.5 text-center">
                  <button
                    type="button"
                    title="詳細設定"
                    onClick={() => onOpenRowDetail(row.id)}
                    className={cn(
                      'rounded border px-2 py-0.5 text-xs',
                      hasDetail ? 'border-blue-400 bg-blue-50 text-blue-700' : 'border-gray-300 text-gray-600',
                    )}
                  >
                    {hasDetail ? '✓' : '⋯'}
                  </button>
                </td>
                <td className="px-2 py-1.5 text-center">
                  <span title={row.isValid ? '' : `エラー: ${row.errors.join(', ')}`}>
                    <Badge variant={row.isValid ? 'success' : 'danger'}>{row.isValid ? 'OK' : 'エラー'}</Badge>
                  </span>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>

      {contextMenu && (
        <ContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          onClose={() => setContextMenu(null)}
          items={contextItems(contextMenu.rowId)}
        />
      )}
    </>
  );
}
