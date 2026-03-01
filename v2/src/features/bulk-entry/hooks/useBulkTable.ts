import { useMemo } from 'react';
import {
  createColumnHelper,
  getCoreRowModel,
  getFilteredRowModel,
  useReactTable,
  type ColumnDef,
  type FilterFn,
} from '@tanstack/react-table';
import type { BulkRow } from '@/types/app';
import { useBulkStore } from '@/stores/bulkStore';

const columnHelper = createColumnHelper<BulkRow>();

export function createBulkColumns(): ColumnDef<BulkRow, unknown>[] {
  return [
    columnHelper.display({
      id: 'select',
      header: () => null, // Handled externally
      size: 40,
      cell: () => null, // Handled in BulkTable
    }) as ColumnDef<BulkRow, unknown>,
    columnHelper.display({
      id: 'drag',
      header: '',
      size: 32,
      cell: () => null, // Handled in BulkTable
    }) as ColumnDef<BulkRow, unknown>,
    columnHelper.display({
      id: 'rowNumber',
      header: '#',
      size: 40,
      cell: (info) => info.row.index + 1,
    }) as ColumnDef<BulkRow, unknown>,
    columnHelper.accessor('propertyCode', {
      header: '物件コード',
      size: 120,
    }) as ColumnDef<BulkRow, unknown>,
    columnHelper.accessor('terminalId', {
      header: '端末ID',
      size: 100,
    }) as ColumnDef<BulkRow, unknown>,
    columnHelper.accessor('vendorName', {
      header: '保守会社名',
      size: 140,
    }) as ColumnDef<BulkRow, unknown>,
    columnHelper.accessor('inspectionType', {
      header: '点検種別',
      size: 140,
    }) as ColumnDef<BulkRow, unknown>,
    columnHelper.accessor('startDate', {
      header: '開始日',
      size: 120,
    }) as ColumnDef<BulkRow, unknown>,
    columnHelper.accessor('endDate', {
      header: '終了日',
      size: 120,
    }) as ColumnDef<BulkRow, unknown>,
    columnHelper.accessor('displayStartDate', {
      header: '表示開始日',
      size: 120,
    }) as ColumnDef<BulkRow, unknown>,
    columnHelper.accessor('displayEndDate', {
      header: '表示終了日',
      size: 120,
    }) as ColumnDef<BulkRow, unknown>,
    columnHelper.accessor('remarks', {
      header: '備考',
      size: 160,
    }) as ColumnDef<BulkRow, unknown>,
    columnHelper.display({
      id: 'status',
      header: 'ステータス',
      size: 80,
      cell: () => null, // Handled in BulkTable
    }) as ColumnDef<BulkRow, unknown>,
    columnHelper.display({
      id: 'actions',
      header: '',
      size: 60,
      cell: () => null, // Handled in BulkTable
    }) as ColumnDef<BulkRow, unknown>,
  ];
}

const validityFilter: FilterFn<BulkRow> = (row, _columnId, filterValue: string) => {
  if (filterValue === 'all') return true;
  if (filterValue === 'valid') return row.original._isValid;
  if (filterValue === 'error') return !row.original._isValid;
  return true;
};

export function useBulkTable() {
  const rows = useBulkStore((s) => s.rows);
  const filter = useBulkStore((s) => s.filter);

  const columns = useMemo(() => createBulkColumns(), []);

  // eslint-disable-next-line react-hooks/incompatible-library
  const table = useReactTable({
    data: rows,
    columns,
    getCoreRowModel: getCoreRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getRowId: (row) => row._id,
    globalFilterFn: validityFilter,
    state: {
      globalFilter: filter,
    },
    enableGlobalFilter: true,
  });

  return { table };
}
