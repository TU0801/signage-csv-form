import { useState, useMemo, useCallback } from 'react';
import { Button } from '@/components/ui/Button';
import { Spinner } from '@/components/ui/Spinner';
import { Card, CardHeader, CardContent } from '@/components/ui/Card';
import { useToast } from '@/components/ui/Toast';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { EntryDetailModal } from '@/features/approval/components/EntryDetailModal';
import {
  deleteEntry,
  entryErrorReason,
  updateEntriesStatusBulk,
  type AdminEntryStatus,
} from '@/lib/api/admin-entries';
import type { DbEntry } from '@/types/database';
import { EntriesFilters } from './EntriesFilters';
import { EntryActions } from './EntryActions';
import { EntryEditModal } from './EntryEditModal';
import { useEntriesTable } from '../hooks/useEntriesTable';
import { useEntriesFilters } from '../hooks/useEntriesFilters';
import { useEntryLookups } from '../hooks/useEntryLookups';
import {
  bulkStatusLabel,
  formatJaDate,
  formatJaDateTime,
  loadEntrySort,
  saveEntrySort,
  sortEntries,
  toggleEntrySort,
  type EntrySort,
  type EntrySortColumn,
} from '../lib/entries';

const SORTABLE_COLUMNS: { column: EntrySortColumn; label: string }[] = [
  { column: 'property_code', label: '物件コード' },
  { column: 'property_name', label: '物件名' },
  { column: 'inspection_type', label: '点検種別' },
  { column: 'inspection_start', label: '点検開始日' },
  { column: 'inspection_end', label: '点検終了日' },
  { column: 'remarks', label: '作業時間 及び 備考' },
  { column: 'vendor_name', label: '保守会社' },
  { column: 'created_at', label: '登録日時' },
];

const th = 'px-3 py-3 text-xs font-medium text-gray-500 whitespace-nowrap';
const td = 'px-3 py-2 text-sm text-gray-900';

/** データ一覧（承認済みのみ） */
// v1: js/admin-entries.js loadEntries / renderEntries
export function EntriesTable() {
  const { filters, updateFilter } = useEntriesFilters();
  const { entries, loading, error, refetch } = useEntriesTable(filters);
  const lookups = useEntryLookups();
  const { addToast } = useToast();

  const [sort, setSort] = useState<EntrySort>(loadEntrySort);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [detailEntry, setDetailEntry] = useState<DbEntry | null>(null);
  const [editEntry, setEditEntry] = useState<DbEntry | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);

  const sorted = useMemo(
    () => sortEntries(entries, sort, lookups.propertyNames),
    [entries, sort, lookups.propertyNames],
  );
  // 読み直した一覧に無い行は選択から外す（v1 は描画のたびに選択を解除していた）
  const selectedEntries = useMemo(
    () => entries.filter((e) => selectedIds.has(e.id)),
    [entries, selectedIds],
  );
  const allSelected = entries.length > 0 && selectedEntries.length === entries.length;

  // v1: js/admin-entries.js loadEntries（操作後の読み直し。選択は解除する）
  const reload = useCallback(async () => {
    setSelectedIds(new Set());
    await refetch();
  }, [refetch]);

  const handleSort = (column: EntrySortColumn) => {
    const next = toggleEntrySort(sort, column);
    saveEntrySort(next);
    setSort(next);
  };

  const toggleOne = (id: string) =>
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  // v1: js/admin-entries.js toggleSelectAllEntries
  const toggleAll = () =>
    setSelectedIds(allSelected ? new Set() : new Set(entries.map((e) => e.id)));

  // v1: js/admin-entries.js deleteEntryById
  const handleDelete = useCallback(
    async (id: string) => {
      try {
        await deleteEntry(id);
        addToast('削除しました', 'success');
        await reload();
      } catch (err) {
        console.error('Failed to delete entry:', err);
        addToast(`削除に失敗しました: ${entryErrorReason(err)}`, 'error');
      }
    },
    [addToast, reload],
  );

  // v1: js/admin-entries.js bulkDeleteEntries
  const handleBulkDelete = useCallback(
    async (ids: string[]) => {
      if (ids.length === 0) return;
      try {
        await Promise.all(ids.map((id) => deleteEntry(id)));
        addToast(`${ids.length}件のデータを削除しました`, 'success');
      } catch (err) {
        console.error('Bulk delete failed:', err);
        addToast(`削除に失敗しました: ${entryErrorReason(err)}`, 'error');
      }
      await reload();
    },
    [addToast, reload],
  );

  // v1: js/admin-entries.js updateEntriesStatus
  const handleStatusChange = useCallback(
    async (ids: string[], status: AdminEntryStatus) => {
      if (ids.length === 0) return;
      try {
        await updateEntriesStatusBulk(ids, status);
        addToast(`${ids.length}件を「${bulkStatusLabel(status)}」に変更しました`, 'success');
        await reload();
      } catch (err) {
        console.error('Status update failed:', err);
        addToast(`ステータスの更新に失敗しました: ${entryErrorReason(err)}`, 'error');
      }
    },
    [addToast, reload],
  );

  return (
    <div className="space-y-4">
      <EntriesFilters
        filters={filters}
        onUpdateFilter={updateFilter}
        properties={lookups.properties}
        vendors={lookups.vendors}
      />

      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-lg font-semibold text-gray-900">
              データ一覧 ({entries.length}件)
            </h2>
            <Button variant="ghost" size="sm" onClick={reload} disabled={loading}>
              {loading ? '読み込み中...' : '更新'}
            </Button>
          </div>
          <div className="mt-3">
            <EntryActions
              entries={entries}
              selectedEntries={selectedEntries}
              filters={filters}
              propertyNames={lookups.propertyNames}
              displayTimeDefault={lookups.displayTimeDefault}
              onStatusChange={handleStatusChange}
              onBulkDelete={handleBulkDelete}
            />
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {error ? (
            <div className="px-6 py-6">
              <p className="text-red-600">{error}</p>
              <Button variant="secondary" size="sm" onClick={reload} className="mt-2">
                再読み込み
              </Button>
            </div>
          ) : loading && entries.length === 0 ? (
            <div className="flex justify-center py-12">
              <Spinner size="lg" />
            </div>
          ) : entries.length === 0 ? (
            <p className="px-6 py-8 text-center text-sm text-gray-500">データがありません</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left">
                <thead>
                  <tr className="border-b border-gray-200 bg-gray-50">
                    <th className={th}>
                      <input
                        type="checkbox"
                        aria-label="すべて選択"
                        checked={allSelected}
                        onChange={toggleAll}
                        className="h-4 w-4 rounded border-gray-300 text-blue-600"
                      />
                    </th>
                    {SORTABLE_COLUMNS.map(({ column, label }) => (
                      <th
                        key={column}
                        className={`${th} cursor-pointer select-none`}
                        onClick={() => handleSort(column)}
                      >
                        {label}
                        <span className={sort.column === column ? 'text-gray-900' : 'text-gray-300'}>
                          {sort.column === column && sort.ascending ? ' ▲' : ' ▼'}
                        </span>
                      </th>
                    ))}
                    <th className={th}>登録者</th>
                    <th className={th}>操作</th>
                  </tr>
                </thead>
                <tbody>
                  {sorted.map((entry) => (
                    <tr key={entry.id} className="border-b border-gray-100 hover:bg-gray-50">
                      <td className={td}>
                        <input
                          type="checkbox"
                          aria-label="選択"
                          checked={selectedIds.has(entry.id)}
                          onChange={() => toggleOne(entry.id)}
                          className="h-4 w-4 rounded border-gray-300 text-blue-600"
                        />
                      </td>
                      <td className={td}>{entry.property_code}</td>
                      <td className={td}>{lookups.propertyNames.get(entry.property_code) || '-'}</td>
                      <td className={td}>{entry.inspection_type}</td>
                      <td className={td}>{formatJaDate(entry.inspection_start)}</td>
                      <td className={td}>{formatJaDate(entry.inspection_end)}</td>
                      <td className={td}>
                        {entry.remarks ? (
                          <div className="max-w-[150px] truncate" title={entry.remarks}>
                            {entry.remarks}
                          </div>
                        ) : (
                          '-'
                        )}
                      </td>
                      <td className={td}>{entry.vendor_name || '-'}</td>
                      <td className={`${td} whitespace-nowrap`}>{formatJaDateTime(entry.created_at)}</td>
                      <td className={td}>{lookups.emailOf(entry.user_id)}</td>
                      <td className={td}>
                        <div className="flex items-center gap-1">
                          <Button size="sm" variant="ghost" onClick={() => setDetailEntry(entry)}>
                            詳細
                          </Button>
                          <Button size="sm" variant="ghost" onClick={() => setEditEntry(entry)}>
                            編集
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            className="text-red-600 hover:text-red-700"
                            onClick={() => setConfirmDelete(entry.id)}
                          >
                            削除
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      <EntryDetailModal
        entry={detailEntry}
        onClose={() => setDetailEntry(null)}
        emailOf={lookups.emailOf}
        displayDefault={lookups.displayDefault}
      />

      <EntryEditModal
        entry={editEntry}
        mode="list"
        onClose={() => setEditEntry(null)}
        onSaved={reload}
        propertyNames={lookups.propertyNames}
        displayDefault={lookups.displayDefault}
      />

      <ConfirmDialog
        open={confirmDelete !== null}
        onClose={() => setConfirmDelete(null)}
        onConfirm={() => {
          if (confirmDelete) void handleDelete(confirmDelete);
        }}
        title="データ削除"
        message="このデータを削除しますか？"
        confirmLabel="削除する"
        variant="danger"
      />
    </div>
  );
}
