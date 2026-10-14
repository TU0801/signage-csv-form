import { filterApprovedEntries } from '@/lib/csv';
import type { DbEntry } from '@/types/database';
import type {
  AdminEntryFilters,
  AdminEntryStatus,
  EntryDisplayUpdates,
} from '@/lib/api/admin-entries';

// ---------------------------------------------------------------------------
// 並べ替え
// ---------------------------------------------------------------------------

/** 並べ替えできる列（v1 admin.html #tab-entries .sortable の data-sort） */
export type EntrySortColumn =
  | 'property_code'
  | 'property_name'
  | 'inspection_type'
  | 'inspection_start'
  | 'inspection_end'
  | 'remarks'
  | 'vendor_name'
  | 'created_at';

export interface EntrySort {
  column: EntrySortColumn;
  ascending: boolean;
}

export const DEFAULT_ENTRY_SORT: EntrySort = { column: 'created_at', ascending: false };
const SORT_STORAGE_KEY = 'entriesSort';

// v1: js/admin-entries.js initTableSort（LocalStorage から復元）
export function loadEntrySort(): EntrySort {
  try {
    const saved = localStorage.getItem(SORT_STORAGE_KEY);
    if (saved) return { ...DEFAULT_ENTRY_SORT, ...(JSON.parse(saved) as Partial<EntrySort>) };
  } catch {
    // 無効なデータは無視
  }
  return DEFAULT_ENTRY_SORT;
}

export function saveEntrySort(sort: EntrySort): void {
  try {
    localStorage.setItem(SORT_STORAGE_KEY, JSON.stringify(sort));
  } catch {
    // 保存できない環境では無視
  }
}

/** 同じ列なら昇順/降順を反転、別の列なら昇順から */
// v1: js/admin-entries.js initTableSort のクリック処理
export function toggleEntrySort(current: EntrySort, column: EntrySortColumn): EntrySort {
  return current.column === column
    ? { column, ascending: !current.ascending }
    : { column, ascending: true };
}

// v1: js/admin-entries.js sortEntries
export function sortEntries(
  entries: DbEntry[],
  sort: EntrySort,
  propertyNames: Map<string, string>,
): DbEntry[] {
  const { column, ascending } = sort;
  const isDate = column.includes('_at') || column.includes('_start') || column.includes('_end');
  const valueOf = (e: DbEntry): string | number => {
    const raw =
      column === 'property_name'
        ? propertyNames.get(e.property_code) || ''
        : ((e as unknown as Record<string, unknown>)[column] as string | null) || '';
    if (isDate) return raw ? new Date(raw).getTime() : 0;
    return typeof raw === 'string' ? raw.toLowerCase() : raw;
  };
  return [...entries].sort((a, b) => {
    const av = valueOf(a);
    const bv = valueOf(b);
    const comparison = av < bv ? -1 : av > bv ? 1 : 0;
    return ascending ? comparison : -comparison;
  });
}

// ---------------------------------------------------------------------------
// 出力対象
// ---------------------------------------------------------------------------

/**
 * CSV 出力・コピーの対象: 承認済み（ready/exported）かつ 物件・点検開始日の絞り込みに合うもの（選択行ではない）
 */
// v1: js/admin-export.js getFilteredExportEntries
export function filterExportEntries(entries: DbEntry[], filters: AdminEntryFilters): DbEntry[] {
  return filterApprovedEntries(entries).filter((entry) => {
    if (filters.propertyCode && String(entry.property_code) !== filters.propertyCode) return false;
    if (filters.startDate && (entry.inspection_start ?? '') < filters.startDate) return false;
    if (filters.endDate && (entry.inspection_start ?? '') > filters.endDate) return false;
    return true;
  });
}

// ---------------------------------------------------------------------------
// ステータス表示
// ---------------------------------------------------------------------------

/** 詳細モーダルのステータス表示 */
// v1: js/admin-entries.js showEntryDetail（0acbc25 で修正後の判定）
export function entryApprovalLabel(status: DbEntry['status']): string {
  if (status === 'ready' || status === 'exported') return '承認済み';
  if (status === 'pending') return '未申請';
  return '承認待ち';
}

/** 一括ステータス変更の表示名 */
// v1: js/admin-entries.js updateEntriesStatus の statusLabel
export function bulkStatusLabel(status: AdminEntryStatus): string {
  if (status === 'exported') return '取込済み';
  if (status === 'ready') return '未取込';
  if (status === 'pending') return '未申請';
  return '申請済み';
}

// ---------------------------------------------------------------------------
// 編集
// ---------------------------------------------------------------------------

/** 編集モーダルの開き元。承認待ちからの編集は保存で承認になる */
export type EntryEditMode = 'pending' | 'list';

/** 表示位置（frame_No）の選択肢 */
// v1: js/admin-entry-edit.js editEntry の #editPosterPosition
export const POSTER_POSITION_OPTIONS = [
  { value: '1', label: '①上左' },
  { value: '2', label: '②上中' },
  { value: '3', label: '③上右' },
  { value: '4', label: '④中央' },
  { value: '0', label: '⑤全体' },
];

export interface EntryEditForm {
  displayStartDate: string;
  displayStartTime: string;
  displayEndDate: string;
  displayEndTime: string;
  displayDuration: string;
  posterPosition: string;
}

/** 表示時間の既定（設定 display_time_default、無ければ 6 秒） */
export function resolveDisplayDefault(displayTimeDefault: string | number | null | undefined) {
  return Number(displayTimeDefault) || 6;
}

// v1: js/admin-entry-edit.js editEntry（各入力の初期値）
export function toEditForm(entry: DbEntry, displayDefault: number): EntryEditForm {
  return {
    displayStartDate: entry.display_start_date || '',
    displayStartTime: entry.display_start_time || '',
    displayEndDate: entry.display_end_date || '',
    displayEndTime: entry.display_end_time || '',
    displayDuration: String(entry.display_duration || displayDefault),
    posterPosition: POSTER_POSITION_OPTIONS.some((o) => o.value === entry.poster_position)
      ? (entry.poster_position as string)
      : '4',
  };
}

/**
 * 保存する列。承認待ちからの編集は承認（ready）にし、取込済みの編集は未取込（ready）に戻す
 */
// v1: js/admin-entry-edit.js saveEditedEntry
export function buildEditUpdates(
  form: EntryEditForm,
  mode: EntryEditMode,
  originalStatus: DbEntry['status'],
  displayDefault: number,
): EntryDisplayUpdates {
  const updates: EntryDisplayUpdates = {
    display_start_date: form.displayStartDate || null,
    display_start_time: form.displayStartTime || null,
    display_end_date: form.displayEndDate || null,
    display_end_time: form.displayEndTime || null,
    display_duration: parseInt(form.displayDuration, 10) || displayDefault,
    poster_position: form.posterPosition || '4',
  };
  if (mode === 'pending') {
    updates.status = 'ready';
  } else if (originalStatus === 'exported') {
    updates.status = 'ready';
  }
  return updates;
}

// ---------------------------------------------------------------------------
// 日付表示（v1 は toLocaleDateString('ja-JP') / toLocaleString('ja-JP')）
// ---------------------------------------------------------------------------

export function formatJaDate(value: string | null | undefined): string {
  return value ? new Date(value).toLocaleDateString('ja-JP') : '-';
}

export function formatJaDateTime(value: string | null | undefined): string {
  return value ? new Date(value).toLocaleString('ja-JP') : '-';
}
