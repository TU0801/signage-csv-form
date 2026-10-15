import { useCallback, useMemo, useState, type KeyboardEvent } from 'react';
import { useBulkStore } from '@/stores/bulkStore';
import { useToast } from '@/components/ui/Toast';
import { Badge } from '@/components/ui/Badge';
import { cn } from '@/lib/utils';
import { useBulkDragDrop } from '../hooks/useBulkDragDrop';
import { defaultDisplayTime, terminalIdsFor, uniqueProperties } from '../utils/bulkMaster';
import { hasRowDetail, rowDetailSummary } from '../utils/rowDetail';
import { ContextMenu } from './ContextMenu';
import { SearchableSelect } from './SearchableSelect';
import type { BulkEntryRow } from '../types';

interface BulkTableProps {
  onOpenRowDetail: (rowId: number) => void;
  confirm: (message: string) => Promise<boolean>;
}

/**
 * セル内の入力欄の列番号（Enter で次の列へ、Alt+↑↓ で同じ列の前後の行へ）。
 * 端末は選ぶ必要があるときだけ入力欄になるので、無い行では飛ばして次の列へ移る
 */
const COL = { property: 0, terminal: 1, inspection: 2, startDate: 3, endDate: 4, remarks: 5 } as const;
const LAST_COL = COL.remarks;

const cellInputBase = 'block h-7 w-full rounded border px-2 py-0 text-sm focus:border-blue-500 focus:outline-none';
const cellInput = (invalid = false) => cn(cellInputBase, invalid ? 'border-red-400' : 'border-gray-300');

/** 端末を選ばずに読み取りで出すときの見た目（入力欄と同じ高さ） */
const cellText = 'block h-7 truncate px-1 text-xs leading-7';

/** 見出しセル（余白と文字の大きさは cell-head。p* は付けない） */
const th = 'cell-head text-left font-medium text-gray-600';

/** 右端に固定する列の左の境目（横スクロールで下を流れる列と区別する） */
const stickyEdge = 'shadow-[inset_1px_0_0_#e5e7eb]';

/** 備考の title。全文に入力の目安を添える（目安の文言は従来の title のまま残す） */
const REMARKS_HINT = '1行25文字×5行まで';

function focusCell(tr: Element | null | undefined, col: number) {
  const el = tr?.querySelector<HTMLElement>(`[data-col="${col}"]`);
  el?.focus();
  return !!el;
}

/** col より右で最初にある入力欄へ（端末の入力欄が無い行は点検種別へ） */
function focusAfter(tr: Element | null | undefined, col: number) {
  for (let c = col + 1; c <= LAST_COL; c++) {
    if (focusCell(tr, c)) return true;
  }
  return false;
}

/** 検索付きセレクトで選んだら次の列へ（v1 setupSearchableSelect の change） */
function focusNextOf(rowId: number, col: number) {
  setTimeout(() => focusAfter(document.querySelector(`tr[data-row-id="${rowId}"]`), col), 0);
}

/** その欄に関わるエラーがあるか（エラーの文言は validateBulkRow の先頭の語で見分ける） */
function hasError(row: BulkEntryRow, ...prefixes: string[]) {
  return row.errors.some((e) => prefixes.some((p) => e.startsWith(p)));
}

/** 備考の1行の最大文字数に対する、いちばん長い行の文字数 */
function remarksLongestLine(remarks: string) {
  return Math.max(0, ...remarks.split('\n').map((l) => l.length));
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
  const appSettings = useBulkStore((s) => s.appSettings);
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

  // 端末の無い物件（管理者が保守会社を選んだときに候補へ入る）は「(端末なし)」と付けて、選ぶ前に分かるようにする
  const propertyOptions = useMemo(() => {
    const withTerminal = new Set(masterData.properties.filter((p) => p.terminalId).map((p) => String(p.propertyCode)));
    return uniqueProperties(masterData.properties).map((p) => ({
      value: p.propertyCode,
      label: `${p.propertyCode} ${p.propertyName}${withTerminal.has(String(p.propertyCode)) ? '' : ' (端末なし)'}`,
    }));
  }, [masterData.properties]);
  const propertyCodes = useMemo(
    () => new Set(masterData.properties.map((p) => String(p.propertyCode))),
    [masterData.properties],
  );
  const inspectionOptions = useMemo(
    () => masterData.notices.map((n) => ({ value: n.inspectionType, label: n.inspectionType })),
    [masterData.notices],
  );
  const inspectionNames = useMemo(() => new Set(masterData.notices.map((n) => n.inspectionType)), [masterData.notices]);
  const remarksLimit = Number(appSettings.remarks_chars_per_line || 25);
  const displayTimeDefault = defaultDisplayTime(appSettings);

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
          focusAfter(tr, col);
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
            <th className="cell-head w-10 min-w-[2.5rem]">
              <input
                type="checkbox"
                title="すべて選択"
                checked={allSelected}
                onChange={(e) => (e.target.checked ? selectAll() : clearSelection())}
                className="h-4 w-4 rounded border-gray-300"
              />
            </th>
            <th className={cn(th, 'w-10 min-w-[2.5rem]')}>No</th>
            <th className={cn(th, 'min-w-[22rem]')}>
              物件<span className="text-red-500">*</span>
            </th>
            {/* 端末は物件から自動で決まる（1物件1台）ので細く、読み取りで出す */}
            <th className={cn(th, 'w-24 min-w-[6rem]')}>端末</th>
            <th className={cn(th, 'min-w-[16rem]')}>
              点検種別<span className="text-red-500">*</span>
            </th>
            <th className={cn(th, 'w-40 min-w-[10rem]')}>点検開始日</th>
            <th className={cn(th, 'w-40 min-w-[10rem]')}>点検終了日</th>
            <th className={cn(th, 'min-w-[20rem]')}>備考</th>
            {/* 幅は w-* だけだと表が入れ物より広いときに縮むので min-w も付ける。
                詳細・状態は横スクロールしても右端に残す（状態 w-28 = 7rem の左に詳細。状態はエラーの理由も出すので広め） */}
            <th className={cn(th, 'sticky right-[7rem] w-16 min-w-[4rem] bg-gray-50 text-center', stickyEdge)}>詳細</th>
            <th className={cn(th, 'sticky right-0 w-28 min-w-[7rem] bg-gray-50 text-center')}>状態</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row, index) => {
            if (!isVisible(row)) return null;
            const terminalIds = terminalIdsFor(masterData.properties, row.propertyCode);
            const propExists = !!row.propertyCode && propertyCodes.has(String(row.propertyCode));
            // 選ぶ必要があるときだけ端末を入力欄にする（2台以上、または取込の端末IDが物件に無く空になった行）
            const terminalNeedsSelect =
              terminalIds.length >= 2 || (terminalIds.length === 1 && row.terminalId !== terminalIds[0]);
            const unregisteredInspection = !!row.inspectionType && inspectionNames.size > 0 && !inspectionNames.has(row.inspectionType);
            const hasDetail = hasRowDetail(row, displayTimeDefault);
            const remarksLength = remarksLongestLine(row.remarks);
            const selected = selectedIds.has(row.id);
            // 右端に固定する列は下の列が透けないよう背景を塗る（選択中の行の色に合わせる）
            const stickyBg = selected ? 'bg-blue-50' : 'bg-white';
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
                  selected && 'bg-blue-50',
                  draggedRowId === row.id && 'opacity-50',
                  dragOverRowId === row.id && draggedRowId !== row.id && 'border-t-2 border-t-blue-500',
                )}
              >
                <td className="cell text-center align-middle">
                  <input
                    type="checkbox"
                    checked={selected}
                    onChange={() => toggleSelection(row.id)}
                    className="h-4 w-4 rounded border-gray-300"
                  />
                </td>
                <td className="cell align-middle text-xs text-gray-400">{index + 1}</td>
                <td className="cell">
                  <SearchableSelect
                    value={row.propertyCode}
                    options={propertyOptions}
                    placeholder="-- 物件を選択 --"
                    showTitle
                    searchPlaceholder="物件名で検索..."
                    onChange={(v) => changeProperty(row.id, v)}
                    onPicked={() => focusNextOf(row.id, COL.property)}
                    dataCol={COL.property}
                    onKeyDown={(e) => handleCellKeyDown(e, index, COL.property)}
                    invalid={hasError(row, '物件')}
                    initialSearch={row.pastedPropertyName}
                  />
                  {/* 取込で見つからなかった物件名。選択欄を開くとこの文字で検索した状態になる */}
                  {row.pastedPropertyName && !row.propertyCode && (
                    <p className="mt-0.5 truncate text-[11px] text-red-600" title={row.pastedPropertyName}>
                      未一致: {row.pastedPropertyName}
                    </p>
                  )}
                </td>
                <td className="cell">
                  {terminalNeedsSelect ? (
                    <select
                      data-col={COL.terminal}
                      aria-label="端末"
                      value={row.terminalId}
                      onChange={(e) => updateRow(row.id, { terminalId: e.target.value })}
                      onKeyDown={(e) => handleCellKeyDown(e, index, COL.terminal)}
                      className={cellInput(hasError(row, '端末'))}
                    >
                      <option value="">-- 端末 --</option>
                      {terminalIds.map((id) => (
                        <option key={id} value={id}>
                          {id}
                        </option>
                      ))}
                    </select>
                  ) : row.terminalId && !(propExists && terminalIds.length === 0) ? (
                    <span className={cn(cellText, 'text-gray-700')} title={row.terminalId}>
                      {row.terminalId}
                    </span>
                  ) : propExists ? (
                    <span
                      className={cn(cellText, 'font-medium text-red-600')}
                      title="この物件には端末が登録されていません"
                    >
                      端末未設置
                    </span>
                  ) : (
                    <span className={cn(cellText, 'text-gray-400')}>-</span>
                  )}
                </td>
                <td className="cell">
                  <SearchableSelect
                    value={row.inspectionType}
                    options={inspectionOptions}
                    placeholder="-- 点検種別を選択 --"
                    showTitle
                    searchPlaceholder="点検種別で検索..."
                    onChange={(v) => updateRow(row.id, { inspectionType: v })}
                    onPicked={() => focusNextOf(row.id, COL.inspection)}
                    dataCol={COL.inspection}
                    onKeyDown={(e) => handleCellKeyDown(e, index, COL.inspection)}
                    invalid={hasError(row, '点検種別')}
                    initialSearch={unregisteredInspection ? row.inspectionType : undefined}
                  />
                  {/* マスターに無い点検種別（取込の表記ゆれなど）は選択欄に出せないので、入っている文字を下に出す */}
                  {unregisteredInspection && (
                    <p className="mt-0.5 truncate text-[11px] text-red-600" title={row.inspectionType}>
                      未登録: {row.inspectionType}
                    </p>
                  )}
                </td>
                <td className="cell">
                  <input
                    type="date"
                    data-col={COL.startDate}
                    title="点検開始日"
                    value={row.startDate}
                    onChange={(e) => changeStartDate(row.id, e.target.value)}
                    onKeyDown={(e) => handleCellKeyDown(e, index, COL.startDate)}
                    className={cellInput()}
                  />
                </td>
                <td className="cell">
                  <input
                    type="date"
                    data-col={COL.endDate}
                    title="点検終了日"
                    value={row.endDate}
                    onChange={(e) => updateRow(row.id, { endDate: e.target.value })}
                    onKeyDown={(e) => handleCellKeyDown(e, index, COL.endDate)}
                    className={cellInput(hasError(row, '点検終了日'))}
                  />
                </td>
                <td className="cell">
                  {/* 1行の入力欄なので、実際の上限は1行の文字数。入力中に残りの文字数を右端に出す */}
                  <div className="relative">
                    <input
                      type="text"
                      data-col={COL.remarks}
                      value={row.remarks}
                      placeholder="任意入力"
                      maxLength={125}
                      title={row.remarks ? `${row.remarks}\n${REMARKS_HINT}` : REMARKS_HINT}
                      onChange={(e) => changeRemarks(row.id, e.target.value)}
                      onKeyDown={(e) => handleCellKeyDown(e, index, COL.remarks)}
                      className={cn(cellInput(hasError(row, '備考')), row.remarks && 'pr-16')}
                    />
                    {row.remarks && (
                      <span
                        className={cn(
                          'pointer-events-none absolute right-1.5 top-1/2 -translate-y-1/2 text-[11px]',
                          remarksLength > remarksLimit ? 'font-medium text-red-600' : 'text-gray-400',
                        )}
                      >
                        {remarksLength > remarksLimit
                          ? `${remarksLength - remarksLimit}文字超過`
                          : `残り${remarksLimit - remarksLength}文字`}
                      </span>
                    )}
                  </div>
                </td>
                <td className={cn('cell sticky right-[7rem] text-center align-middle', stickyEdge, stickyBg)}>
                  {/* 設定済みかどうかと、表示期間・位置の要約を title で見られるようにする */}
                  <button
                    type="button"
                    title={`詳細設定\n${rowDetailSummary(row)}`}
                    onClick={() => onOpenRowDetail(row.id)}
                    className={cn(
                      'inline-flex h-7 items-center whitespace-nowrap rounded border px-1.5 text-xs',
                      hasError(row, '表示', '案内文')
                        ? 'border-red-400 text-red-600'
                        : hasDetail
                          ? 'border-blue-400 bg-blue-50 text-blue-700'
                          : 'border-gray-300 text-gray-600',
                    )}
                  >
                    {hasDetail ? '詳細✓' : '詳細'}
                  </button>
                </td>
                <td className={cn('cell sticky right-0 text-center align-middle', stickyBg)}>
                  <span title={row.isValid ? '' : `エラー: ${row.errors.join(', ')}`}>
                    <Badge variant={row.isValid ? 'success' : 'danger'}>{row.isValid ? 'OK' : 'エラー'}</Badge>
                  </span>
                  {/* 理由はマウスを乗せなくても読めるよう、バッジの下に短く出す */}
                  {!row.isValid && (
                    <p className="mt-0.5 text-left text-[11px] leading-tight text-red-600">{row.errors.join('・')}</p>
                  )}
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
