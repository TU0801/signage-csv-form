import { useCallback, useMemo, useState, type KeyboardEvent, type ReactNode } from 'react';
import { useBulkStore } from '@/stores/bulkStore';
import { useToast } from '@/components/ui/Toast';
import { cn } from '@/lib/utils';
import { StatusBadge } from '@/features/inspection-portal/components/StatusBadge';
import { formatDate, formatMonth } from '@/features/inspection-portal/lib/schedule';
import type { InspectionStatus } from '@/features/inspection-portal/lib/status';
import { useBulkDragDrop } from '../hooks/useBulkDragDrop';
import { defaultDisplayTime, terminalIdsFor, uniqueProperties } from '../utils/bulkMaster';
import { COL, LAST_INPUT_COL } from '../utils/columns';
import { hasRowDetail, rowDetailSummary } from '../utils/rowDetail';
import { nextSort, orderRows, type SortColumn, type SortState } from '../utils/rowOrder';
import { discardUnheldRowImages, rowPosterImages } from '../utils/discardRowImages';
import { ContextMenu } from './ContextMenu';
import { SearchableSelect } from './SearchableSelect';
import type { BulkEntryRow } from '../types';

/** 行ごとに画面側（点検の予定・管理会社の索引）から引く表示用の情報 */
export interface BulkRowInfo {
  /** 点検予定の行のステータス（手で足した行は undefined） */
  status?: InspectionStatus;
  /** 差戻しの理由（申請・報告書） */
  reason?: string | null;
  managementName: string;
  vendorName: string;
  /** 点検月（例 4,7,10,1）。点検行が無ければ '' */
  months: string;
  /** 検査月（例 2026年4月）。無ければ '-' */
  inspectedOn: string;
  /** 管理会社の正式名（managementName が略称のとき title に出す） */
  managementFullName?: string;
  /** 報告書UP・完了連絡などの操作（点検予定の行で、保守会社・管理者のとき） */
  actions?: ReactNode;
}

interface BulkTableProps {
  onOpenRowDetail: (rowId: number) => void;
  confirm: (message: string) => Promise<boolean>;
  /** 表示する行か（時期・物件の検索・管理会社の絞り込み） */
  isVisible: (row: BulkEntryRow) => boolean;
  /** 物件の候補に出すか（管理会社の絞り込み） */
  propertyAllowed: (propertyCode: string) => boolean;
  infoOf: (row: BulkEntryRow) => BulkRowInfo;
  /** 管理会社の列（保守会社・管理者） */
  showManagement: boolean;
  /** 保守会社の列（管理者だけ） */
  showVendor: boolean;
  /** 予定の行の並べ替え（修正依頼1025 F3。null = 並べ替えなし） */
  sort?: SortState | null;
  onSortChange?: (sort: SortState | null) => void;
}

const cellInputBase = 'block h-7 w-full rounded border px-2 py-0 text-sm focus:border-blue-500 focus:outline-none';
/** 日付の入力欄（列を狭くしたぶん余白と文字を詰める。F6） */
const dateInput = 'px-1 text-xs';
const cellInput = (invalid = false) => cn(cellInputBase, invalid ? 'border-red-400' : 'border-gray-300');

/** 読み取りの値（入力欄と同じ高さ） */
const cellText = 'block min-h-7 px-1 text-xs leading-7';

/** 見出しセル（余白と文字の大きさは cell-head。p* は付けない） */
const th = 'cell-head text-left font-medium text-gray-600';

/** 右端に固定する列の左の境目（横スクロールで下を流れる列と区別する） */
const stickyEdge = 'shadow-[inset_1px_0_0_#e5e7eb]';

/** 備考の title。全文に入力の目安を添える（目安の文言は従来の title のまま残す） */
const REMARKS_HINT = '1行25文字×5行まで';
/** 備考の入力例（B11。1行の入力欄なので2つの例を「/」で並べる） */
export const REMARKS_PLACEHOLDER = '例: 10:00～12:00 / No2号機11:00～12:00';

const SORT_LABEL: Record<SortColumn, string> = {
  status: 'ステータス',
  targetMonth: 'No（対象月）',
  months: '点検月・検査月',
};

/** 並べ替えの見出し（押すたびに 昇順 → 降順 → 解除。修正依頼1025 F3） */
function SortButton({
  column,
  sort,
  onSortChange,
  children,
}: {
  column: SortColumn;
  sort: SortState | null;
  onSortChange?: (sort: SortState | null) => void;
  children: ReactNode;
}) {
  const active = sort?.column === column ? sort.dir : null;
  if (!onSortChange) return <>{children}</>;
  return (
    <button
      type="button"
      onClick={() => onSortChange(nextSort(sort, column))}
      className="inline-flex items-start gap-0.5 text-left font-medium hover:text-blue-700"
      title="押すたびに 昇順 → 降順 → 解除（手で足した行は常に上）"
      aria-label={`${SORT_LABEL[column]}で並べ替え${active === 'asc' ? '（昇順）' : active === 'desc' ? '（降順）' : ''}`}
      data-sort={active ?? undefined}
    >
      <span>{children}</span>
      <span className="flex flex-col text-[8px] leading-[8px]" aria-hidden>
        <span className={active === 'asc' ? 'text-blue-700' : 'text-gray-300'}>▲</span>
        <span className={active === 'desc' ? 'text-blue-700' : 'text-gray-300'}>▼</span>
      </span>
    </button>
  );
}

function focusCell(tr: Element | null | undefined, col: number) {
  const el = tr?.querySelector<HTMLElement>(`[data-col="${col}"]`);
  el?.focus();
  return !!el;
}

/** col より右で最初にある入力欄へ（点検予定の行は物件・点検種別に入力欄が無い） */
function focusAfter(tr: Element | null | undefined, col: number) {
  for (let c = col + 1; c <= LAST_INPUT_COL; c++) {
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
 * 点検登録フォーム（一括入力）の表。上に選択中の保守会社の点検予定（点検行 × 対象月）、その下に手で足した行。
 * 予定の行は物件・点検種別が決まっていて、点検開始日を入れると申請の対象になる。申請済みの予定は読み取りで出す。
 * 手で足した行は物件（検索付き）・点検種別（検索付き）・点検日・備考・メモを直接編集する。
 * v1: js/bulk-table.js renderRow / setupRowEventListeners / handleCellKeyDown
 */
export function BulkTable({
  onOpenRowDetail,
  confirm,
  isVisible,
  propertyAllowed,
  infoOf,
  showManagement,
  showVendor,
  sort = null,
  onSortChange,
}: BulkTableProps) {
  const { addToast } = useToast();
  const rows = useBulkStore((s) => s.rows);
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
  const changeMemo = useBulkStore((s) => s.changeMemo);
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
    return uniqueProperties(masterData.properties)
      .filter((p) => propertyAllowed(String(p.propertyCode)))
      .map((p) => ({
        value: p.propertyCode,
        label: `${p.propertyCode} ${p.propertyName}${withTerminal.has(String(p.propertyCode)) ? '' : ' (端末なし)'}`,
      }));
  }, [masterData.properties, propertyAllowed]);
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

  // 手で足した行 → 予定の行（並べ替えは予定の行だけ）。修正依頼1025 F1・F3
  const visibleRows = orderRows(rows, isVisible, infoOf, sort);
  const storeIndex = new Map(rows.map((r, i) => [r.id, i]));
  const allSelected = visibleRows.length > 0 && visibleRows.every((r) => selectedIds.has(r.id));
  // No は表示中の行の通し番号（時期などで隠れた予定の行は数えない。申請時のエラーの「N行目」も同じ番号）
  const visibleNo = new Map(visibleRows.map((r, i) => [r.id, i + 1]));
  let lastManualIndex = -1;
  rows.forEach((r, i) => {
    if (!r.schedule) lastManualIndex = i;
  });

  // v1: js/bulk-table.js handleCellKeyDown
  const handleCellKeyDown = useCallback(
    (e: KeyboardEvent<HTMLElement>, rowIndex: number, col: number) => {
      const tr = e.currentTarget.closest('tr');
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        if (col < LAST_INPUT_COL && focusAfter(tr, col)) return;
        // 手で足した行の最後の行で Enter: 行を足す（新しい行は表の一番上。F1）。足した行の物件欄へ移る
        if (rowIndex === lastManualIndex) {
          addRowWithCopy();
          setTimeout(() => {
            const first = document.querySelector('tbody tr[data-row-id]');
            first?.scrollIntoView?.({ block: 'nearest' });
            focusCell(first, COL.property);
          }, 0);
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
    [lastManualIndex, addRowWithCopy],
  );

  // v1: js/bulk-modals.js handleContextMenuAction（点検予定の行には出さない）
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
            const images = rowPosterImages(useBulkStore.getState().rows.filter((r) => r.id === rowId));
            removeRows([rowId]);
            discardUnheldRowImages(images);
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
            <th className="cell-head w-8 min-w-[2rem]">
              <input
                type="checkbox"
                title="すべて選択"
                checked={allSelected}
                onChange={(e) => (e.target.checked ? selectAll() : clearSelection())}
                className="h-4 w-4 rounded border-gray-300"
              />
            </th>
            {/* 並びは注記の配置どおり: ステータス・報告書UP・完了連絡 → No（対象月）→ 点検月/検査月 → 物件（F15）。
                ステータス・No・点検月/検査月は見出しの ▲▼ で予定の行を並べ替える（修正依頼1025 F3） */}
            <th className={cn(th, 'min-w-[7rem]')}>
              <SortButton column="status" sort={sort} onSortChange={onSortChange}>
                ステータス
              </SortButton>
            </th>
            <th className={cn(th, 'min-w-[8.5rem]')}>報告書UP・完了連絡</th>
            <th className={cn(th, 'w-20 min-w-[5rem]')}>
              <SortButton column="targetMonth" sort={sort} onSortChange={onSortChange}>
                No<div className="text-[10px] font-normal text-gray-400">対象月</div>
              </SortButton>
            </th>
            {/* 点検月と検査月は1列に上下2段（F4） */}
            <th className={cn(th, 'min-w-[5.5rem]')}>
              <SortButton column="months" sort={sort} onSortChange={onSortChange}>
                点検月<div className="text-[10px] font-normal text-gray-400">検査月</div>
              </SortButton>
            </th>
            <th className={cn(th, 'min-w-[15rem]')}>
              物件<span className="text-red-500">*</span>
            </th>
            {showManagement && <th className={cn(th, 'w-28 min-w-[6rem]')}>管理会社</th>}
            {showVendor && <th className={cn(th, 'w-32 min-w-[7rem]')}>保守会社</th>}
            <th className={cn(th, 'min-w-[12rem]')}>
              点検種別<span className="text-red-500">*</span>
            </th>
            {/* 日付の列は狭く（F6。yyyy/mm/dd とカレンダーのボタンが入る幅） */}
            <th className={cn(th, 'w-[7.5rem] min-w-[7.5rem]')}>点検開始日</th>
            <th className={cn(th, 'w-[7.5rem] min-w-[7.5rem]')}>点検終了日</th>
            <th className={cn(th, 'min-w-[14rem]')}>備考（作業時間を記載下さい）</th>
            <th className={cn(th, 'min-w-[9rem]')} title="CSV には出ません（点検月の変更などの覚え書き）">
              メモ
            </th>
            {/* 幅は w-* だけだと表が入れ物より広いときに縮むので min-w も付ける。詳細は横スクロールしても右端に残す */}
            <th className={cn(th, 'sticky right-0 w-16 min-w-[4rem] bg-gray-50 text-center', stickyEdge)}>詳細</th>
          </tr>
        </thead>
        <tbody>
          {visibleRows.map((row) => {
            const index = storeIndex.get(row.id) ?? -1;
            const schedule = row.schedule;
            const locked = !!schedule?.locked;
            // ドラッグでの並べ替えは手で足した行だけ。見出しで並べ替えている間は止める
            const draggable = !schedule && !sort;
            const info = infoOf(row);
            const terminalIds = schedule ? schedule.terminalIds : terminalIdsFor(masterData.properties, row.propertyCode);
            const propExists = !!schedule || (!!row.propertyCode && propertyCodes.has(String(row.propertyCode)));
            const unregisteredInspection =
              !schedule && !!row.inspectionType && inspectionNames.size > 0 && !inspectionNames.has(row.inspectionType);
            const hasDetail = hasRowDetail(row, displayTimeDefault);
            const remarksLength = remarksLongestLine(row.remarks);
            const selected = selectedIds.has(row.id);
            const noTerminal = !schedule && propExists && terminalIds.length === 0;
            // 右端に固定する列は下の列が透けないよう背景を塗る（選択中の行の色に合わせる）
            const stickyBg = selected ? 'bg-blue-50' : locked ? 'bg-gray-50' : 'bg-white';
            return (
              <tr
                key={row.id}
                data-row-id={row.id}
                data-schedule={schedule ? (locked ? 'locked' : 'open') : undefined}
                data-unit={schedule?.secondary ? 'secondary' : undefined}
                draggable={draggable}
                onDragStart={draggable ? handleDragStart(row.id) : undefined}
                onDragOver={draggable ? handleDragOver(row.id) : undefined}
                onDrop={draggable ? handleDrop(row.id) : undefined}
                onDragEnd={draggable ? handleDragEnd : undefined}
                onContextMenu={(e) => {
                  if (schedule) return;
                  e.preventDefault();
                  setContextMenu({ x: e.clientX, y: e.clientY, rowId: row.id });
                }}
                className={cn(
                  'border-b align-top',
                  // 2台目以降の行は1台目の行と続けて見えるよう上の罫線を点線に（H1）
                  schedule?.secondary && 'border-t [border-top-style:dashed]',
                  locked && !schedule?.reportOnly && !schedule?.secondary && 'bg-gray-50',
                  info.status === 'overdue' && !selected && 'bg-red-50/60',
                  selected && 'bg-blue-50',
                  draggedRowId === row.id && 'opacity-50',
                  dragOverRowId === row.id && draggedRowId !== row.id && 'border-t-2 border-t-blue-500',
                )}
              >
                <td className="cell text-center align-middle">
                  <input
                    type="checkbox"
                    aria-label={`${visibleNo.get(row.id)}行目を選択`}
                    checked={selected}
                    onChange={() => toggleSelection(row.id)}
                    className="h-4 w-4 rounded border-gray-300"
                  />
                </td>
                <td className="cell">
                  {info.status ? (
                    <>
                      <StatusBadge status={info.status} />
                      {info.reason && (
                        <p className="mt-0.5 max-w-[12rem] whitespace-pre-line text-[11px] leading-tight text-amber-800">
                          理由: {info.reason}
                        </p>
                      )}
                    </>
                  ) : (
                    <span className={cn(cellText, 'text-gray-400')}>－</span>
                  )}
                </td>
                <td className="cell whitespace-nowrap">{info.actions ?? <span className={cn(cellText, 'text-gray-400')}>－</span>}</td>
                <td className="cell whitespace-nowrap text-xs text-gray-400">
                  <div>{visibleNo.get(row.id)}</div>
                  {schedule && (
                    <div className="text-[11px] tabular-nums text-gray-700" data-testid="target-month">
                      {schedule.targetMonth ? formatMonth(schedule.targetMonth) : '点検月未登録'}
                    </div>
                  )}
                </td>
                <td className="cell">
                  <div className="px-1 py-1 text-xs leading-tight tabular-nums text-gray-700">
                    <div data-testid="inspection-months">{info.months || '－'}</div>
                    <div className="whitespace-nowrap text-[11px] text-gray-500" data-testid="inspected-on">
                      {info.inspectedOn}
                    </div>
                  </div>
                </td>
                <td className="cell">
                  {schedule ? (
                    <div className="px-1 text-xs leading-tight" title={`${row.propertyCode} ${schedule.propertyName}`}>
                      <div className="text-gray-900">{schedule.propertyName}</div>
                      {/* 設備会社固有の No（号機。サイネージの台は端末番号）を出し、物件コードは小さく添える（修正依頼1025 H2） */}
                      {schedule.unitCode && (
                        <div className="text-[11px] font-semibold text-red-700" data-testid="unit-code">
                          {schedule.unitCode}
                        </div>
                      )}
                      {schedule.unitCode !== row.propertyCode && (
                        <div className="text-[11px] text-gray-500">{row.propertyCode}</div>
                      )}
                    </div>
                  ) : (
                    <>
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
                        invalid={hasError(row, '物件', '端末')}
                        initialSearch={row.pastedPropertyName}
                      />
                      {/* 取込で見つからなかった物件名。選択欄を開くとこの文字で検索した状態になる */}
                      {row.pastedPropertyName && !row.propertyCode && (
                        <p className="mt-0.5 truncate text-[11px] text-red-600" title={row.pastedPropertyName}>
                          未一致: {row.pastedPropertyName}
                        </p>
                      )}
                      {/* 端末の列は外した（B8）。端末の無い物件は申請できないので、物件の下に出す（B7） */}
                      {noTerminal && (
                        <p className="mt-0.5 text-[11px] font-medium text-red-600" title="この物件には端末が登録されていません">
                          端末未設置
                        </p>
                      )}
                      {/* 取込の端末IDが物件に無かった行（旧6列の取込）。物件を選び直すと物件の端末になる */}
                      {!noTerminal && hasError(row, '端末') && (
                        <p className="mt-0.5 text-[11px] font-medium text-red-600">
                          端末IDが物件と合いません。物件を選び直してください
                        </p>
                      )}
                    </>
                  )}
                </td>
                {showManagement && (
                  <td className="cell">
                    {/* 略称（未登録なら正式名）を折り返して出す（修正依頼1025 F5）。正式名は title */}
                    <span
                      className="block min-h-7 max-w-[7rem] whitespace-normal break-all px-1 py-1 text-xs leading-tight text-gray-700"
                      title={info.managementFullName ?? info.managementName}
                    >
                      {info.managementName || '－'}
                    </span>
                  </td>
                )}
                {showVendor && (
                  <td className="cell">
                    <span className={cn(cellText, 'block max-w-[9rem] truncate text-gray-700')} title={info.vendorName}>
                      {info.vendorName || '－'}
                    </span>
                  </td>
                )}
                <td className="cell">
                  {schedule ? (
                    <span className={cn(cellText, 'text-gray-900')}>{row.inspectionType || '－'}</span>
                  ) : (
                    <>
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
                        invalid={hasError(row, '点検種別') || unregisteredInspection}
                        initialSearch={unregisteredInspection ? row.inspectionType : undefined}
                      />
                      {/* マスターに無い点検種別（取込の表記ゆれなど）は選択欄に出せないので、入っている文字を下に出す。
                          警告だけで申請・CSV は止めない（v1 と同じ） */}
                      {unregisteredInspection && (
                        <p className="mt-0.5 truncate text-[11px] text-red-600" title={row.inspectionType}>
                          未登録: {row.inspectionType}
                        </p>
                      )}
                    </>
                  )}
                </td>
                <td className="cell">
                  {schedule?.reportOnly ? (
                    // 申請不要（報告書のみ）の点検は日付を入れない（修正依頼1025 H4/G4）
                    <span className={cn(cellText, 'whitespace-nowrap text-gray-500')} title="申請不要（報告書UP・完了連絡だけ）">
                      申請不要
                    </span>
                  ) : locked ? (
                    <span className={cn(cellText, 'tabular-nums')}>{formatDate(row.startDate) || '－'}</span>
                  ) : (
                    <input
                      type="date"
                      data-col={COL.startDate}
                      title="点検開始日"
                      aria-label="点検開始日"
                      value={row.startDate}
                      onChange={(e) => changeStartDate(row.id, e.target.value)}
                      onKeyDown={(e) => handleCellKeyDown(e, index, COL.startDate)}
                      className={cn(cellInput(), dateInput)}
                    />
                  )}
                </td>
                <td className="cell">
                  {schedule?.reportOnly ? (
                    <span className={cn(cellText, 'text-gray-400')}>－</span>
                  ) : locked ? (
                    <span className={cn(cellText, 'tabular-nums')}>{formatDate(row.endDate) || '－'}</span>
                  ) : (
                    <input
                      type="date"
                      data-col={COL.endDate}
                      title="点検終了日"
                      aria-label="点検終了日"
                      value={row.endDate}
                      onChange={(e) => updateRow(row.id, { endDate: e.target.value })}
                      onKeyDown={(e) => handleCellKeyDown(e, index, COL.endDate)}
                      className={cn(cellInput(hasError(row, '点検終了日')), dateInput)}
                    />
                  )}
                </td>
                <td className="cell">
                  {locked ? (
                    <span className={cn(cellText, 'whitespace-pre-line leading-tight text-gray-700')}>{row.remarks || '－'}</span>
                  ) : (
                    // 1行の入力欄なので、実際の上限は1行の文字数。入力中に残りの文字数を右端に出す
                    <div className="relative">
                      <input
                        type="text"
                        data-col={COL.remarks}
                        aria-label="備考"
                        value={row.remarks}
                        placeholder={REMARKS_PLACEHOLDER}
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
                  )}
                </td>
                <td className="cell">
                  {locked ? (
                    // 申請に保存したメモを読み取りで出す（B12。読めるのは自分の申請と管理者）
                    row.memo ? (
                      <span className={cn(cellText, 'max-w-[14rem] truncate')} title={row.memo}>
                        {row.memo}
                      </span>
                    ) : (
                      <span className={cn(cellText, 'text-gray-400')}>－</span>
                    )
                  ) : (
                    <input
                      type="text"
                      data-col={COL.memo}
                      aria-label="メモ"
                      value={row.memo}
                      placeholder="CSVに出ないメモ"
                      maxLength={500}
                      title={row.memo || '点検月の変更などのメモ（CSV には出ません）'}
                      onChange={(e) => changeMemo(row.id, e.target.value)}
                      onKeyDown={(e) => handleCellKeyDown(e, index, COL.memo)}
                      className={cellInput()}
                    />
                  )}
                </td>
                <td className={cn('cell sticky right-0 text-center align-middle', stickyEdge, stickyBg)}>
                  {/* 設定済みかどうかと、表示期間・位置の要約を title で見られるようにする */}
                  <button
                    type="button"
                    data-col={COL.detail}
                    disabled={locked}
                    title={
                      schedule?.secondary
                        ? '2台目以降の行は1台目の行で申請します'
                        : schedule?.reportOnly
                          ? '申請不要（報告書のみ）の点検です'
                          : locked
                            ? '申請済みの予定は詳細を変えられません'
                            : `詳細設定\n${rowDetailSummary(row)}`
                    }
                    onClick={() => onOpenRowDetail(row.id)}
                    className={cn(
                      'inline-flex h-7 items-center whitespace-nowrap rounded border px-1.5 text-xs disabled:opacity-40',
                      hasError(row, '表示', '案内文', '貼紙')
                        ? 'border-red-400 text-red-600'
                        : hasDetail
                          ? 'border-blue-400 bg-blue-50 text-blue-700'
                          : 'border-gray-300 text-gray-600',
                    )}
                  >
                    {hasDetail ? '詳細✓' : '詳細'}
                  </button>
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
