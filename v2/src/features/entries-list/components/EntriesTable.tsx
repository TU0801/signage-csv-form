import { useState, useMemo, useCallback } from 'react';
import {
  useReactTable,
  getCoreRowModel,
  getSortedRowModel,
  getFilteredRowModel,
  flexRender,
  type ColumnDef,
  type SortingState,
  type RowSelectionState,
} from '@tanstack/react-table';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Spinner } from '@/components/ui/Spinner';
import { Card, CardHeader, CardContent } from '@/components/ui/Card';
import { useToast } from '@/components/ui/Toast';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { EntriesFilters } from './EntriesFilters';
import { EntryActions } from './EntryActions';
import { EntryEditModal } from './EntryEditModal';
import { useEntriesTable } from '../hooks/useEntriesTable';
import { useEntriesFilters } from '../hooks/useEntriesFilters';
import { useEntryMutations } from '../hooks/useEntryMutations';
import type { DbEntry } from '@/types/database';
import { useMasterData } from '@/hooks/useMasterData';
import { formatDateSlash } from '@/lib/utils';

const statusVariantMap: Record<string, 'default' | 'success' | 'warning' | 'danger' | 'primary'> = {
  pending: 'warning',
  draft: 'default',
  ready: 'success',
  exported: 'primary',
};

export function EntriesTable() {
  const { filters, updateFilter, resetFilters, hasActiveFilters } = useEntriesFilters();
  const { entries, loading, error, refetch } = useEntriesTable(filters);
  const { addToast } = useToast();
  const { properties } = useMasterData();

  const propertyNameMap = useMemo(() => {
    const map = new Map<string, string>();
    for (const p of properties) {
      map.set(p.property_code, p.property_name);
    }
    return map;
  }, [properties]);
  const { updateEntry, updateStatusBulk, deleteEntry } = useEntryMutations(refetch);

  const [sorting, setSorting] = useState<SortingState>([]);
  const [rowSelection, setRowSelection] = useState<RowSelectionState>({});
  const [editEntry, setEditEntry] = useState<DbEntry | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);

  const columns = useMemo<ColumnDef<DbEntry>[]>(
    () => [
      {
        id: 'select',
        header: ({ table }) => (
          <input
            type="checkbox"
            checked={table.getIsAllRowsSelected()}
            onChange={table.getToggleAllRowsSelectedHandler()}
            className="h-4 w-4 rounded border-gray-300 text-blue-600"
          />
        ),
        cell: ({ row }) => (
          <input
            type="checkbox"
            checked={row.getIsSelected()}
            onChange={row.getToggleSelectedHandler()}
            className="h-4 w-4 rounded border-gray-300 text-blue-600"
          />
        ),
        enableSorting: false,
        size: 40,
      },
      {
        accessorKey: 'property_code',
        header: '物件コード',
        size: 120,
      },
      {
        id: 'property_name',
        header: '物件名',
        cell: ({ row }) => propertyNameMap.get(row.original.property_code) ?? '-',
        size: 150,
      },
      {
        accessorKey: 'terminal_id',
        header: '端末ID',
        size: 100,
      },
      {
        accessorKey: 'vendor_name',
        header: '保守会社',
        size: 150,
      },
      {
        accessorKey: 'inspection_type',
        header: '点検種別',
        size: 120,
      },
      {
        accessorKey: 'inspection_start',
        header: '点検開始日',
        cell: ({ getValue }) => {
          const val = getValue<string | null>();
          return val ? formatDateSlash(val) : '-';
        },
        size: 110,
      },
      {
        accessorKey: 'inspection_end',
        header: '点検終了日',
        cell: ({ getValue }) => {
          const val = getValue<string | null>();
          return val ? formatDateSlash(val) : '-';
        },
        size: 110,
      },
      {
        accessorKey: 'display_start_date',
        header: '表示開始日',
        cell: ({ getValue }) => {
          const val = getValue<string | null>();
          return val ? formatDateSlash(val) : '-';
        },
        size: 110,
      },
      {
        accessorKey: 'display_end_date',
        header: '表示終了日',
        cell: ({ getValue }) => {
          const val = getValue<string | null>();
          return val ? formatDateSlash(val) : '-';
        },
        size: 110,
      },
      {
        accessorKey: 'status',
        header: 'ステータス',
        cell: ({ getValue }) => {
          const status = getValue<string | null>();
          if (!status) return '-';
          return <Badge variant={statusVariantMap[status] ?? 'default'}>{status}</Badge>;
        },
        size: 100,
      },
      {
        accessorKey: 'remarks',
        header: '備考',
        cell: ({ getValue }) => {
          const val = getValue<string | null>();
          if (!val) return '-';
          const truncated = val.length > 20 ? val.slice(0, 20) + '...' : val;
          return (
            <span title={val} className="cursor-default">
              {truncated}
            </span>
          );
        },
        size: 150,
      },
      {
        accessorKey: 'user_id',
        header: '登録者',
        cell: ({ getValue }) => {
          const val = getValue<string | null>();
          return val ? val.slice(0, 8) + '...' : '-';
        },
        size: 100,
      },
      {
        id: 'actions',
        header: '操作',
        cell: ({ row }) => (
          <div className="flex items-center gap-1">
            <Button size="sm" variant="ghost" onClick={() => setEditEntry(row.original)}>
              編集
            </Button>
            <Button
              size="sm"
              variant="ghost"
              className="text-red-600 hover:text-red-700"
              onClick={() => setConfirmDelete(row.original.id)}
            >
              削除
            </Button>
          </div>
        ),
        enableSorting: false,
        size: 120,
      },
    ],
    [propertyNameMap],
  );

  // eslint-disable-next-line react-hooks/incompatible-library
  const table = useReactTable({
    data: entries,
    columns,
    state: { sorting, rowSelection },
    onSortingChange: setSorting,
    onRowSelectionChange: setRowSelection,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    enableRowSelection: true,
  });

  const selectedEntries = useMemo(() => {
    return table.getSelectedRowModel().rows.map((row) => row.original);
  }, [table, rowSelection]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleSaveEntry = useCallback(
    async (id: string, updates: Partial<DbEntry>) => {
      try {
        await updateEntry(id, updates);
        addToast('エントリーを更新しました', 'success');
      } catch {
        addToast('更新に失敗しました', 'error');
        throw new Error('Update failed');
      }
    },
    [updateEntry, addToast],
  );

  const handleDelete = useCallback(
    async (id: string) => {
      try {
        await deleteEntry(id);
        addToast('エントリーを削除しました', 'success');
      } catch {
        addToast('削除に失敗しました', 'error');
      }
    },
    [deleteEntry, addToast],
  );

  const handleStatusChange = useCallback(
    async (ids: string[], status: string) => {
      await updateStatusBulk(ids, status as DbEntry['status'] & string);
    },
    [updateStatusBulk],
  );

  if (loading && entries.length === 0) {
    return (
      <div className="flex justify-center py-12">
        <Spinner size="lg" />
      </div>
    );
  }

  if (error) {
    return (
      <Card>
        <CardContent>
          <p className="text-red-600">{error}</p>
          <Button variant="secondary" size="sm" onClick={refetch} className="mt-2">
            再読み込み
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <EntriesFilters
        filters={filters}
        onUpdateFilter={updateFilter}
        onReset={resetFilters}
        hasActiveFilters={hasActiveFilters}
      />

      <EntryActions
        selectedEntries={selectedEntries}
        onStatusChange={handleStatusChange}
        onClearSelection={() => setRowSelection({})}
      />

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-gray-900">
              エントリー一覧 ({entries.length}件)
            </h2>
            <Button variant="ghost" size="sm" onClick={refetch} disabled={loading}>
              {loading ? '読み込み中...' : '更新'}
            </Button>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {entries.length === 0 ? (
            <p className="px-6 py-8 text-center text-sm text-gray-500">
              エントリーがありません
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left">
                <thead>
                  {table.getHeaderGroups().map((headerGroup) => (
                    <tr key={headerGroup.id} className="border-b border-gray-200 bg-gray-50">
                      {headerGroup.headers.map((header) => (
                        <th
                          key={header.id}
                          className="px-4 py-3 text-xs font-medium uppercase text-gray-500"
                          style={{ width: header.getSize() }}
                          onClick={header.column.getToggleSortingHandler()}
                        >
                          <div className="flex items-center gap-1 cursor-pointer select-none">
                            {header.isPlaceholder
                              ? null
                              : flexRender(header.column.columnDef.header, header.getContext())}
                            {header.column.getIsSorted() === 'asc' && ' \u2191'}
                            {header.column.getIsSorted() === 'desc' && ' \u2193'}
                          </div>
                        </th>
                      ))}
                    </tr>
                  ))}
                </thead>
                <tbody>
                  {table.getRowModel().rows.map((row) => (
                    <tr key={row.id} className="border-b border-gray-100 hover:bg-gray-50">
                      {row.getVisibleCells().map((cell) => (
                        <td key={cell.id} className="px-4 py-3 text-sm text-gray-900">
                          {flexRender(cell.column.columnDef.cell, cell.getContext())}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      <EntryEditModal
        open={editEntry !== null}
        onClose={() => setEditEntry(null)}
        entry={editEntry}
        onSave={handleSaveEntry}
      />

      <ConfirmDialog
        open={confirmDelete !== null}
        onClose={() => setConfirmDelete(null)}
        onConfirm={() => {
          if (confirmDelete) handleDelete(confirmDelete);
        }}
        title="エントリー削除"
        message="このエントリーを削除してもよろしいですか？この操作は取り消せません。"
        confirmLabel="削除する"
        variant="danger"
      />
    </div>
  );
}
