import { useBulkStore } from '@/stores/bulkStore';
import { cn } from '@/lib/utils';
import type { BulkFilter } from '../types';

const FILTERS: { key: BulkFilter; label: string }[] = [
  { key: 'all', label: 'すべて' },
  { key: 'valid', label: '有効のみ' },
  { key: 'error', label: 'エラーのみ' },
];

/** 表示の絞り込み（すべて／有効のみ／エラーのみ）と表示中の件数。v1: bulk.html .filter-bar / js/bulk-data.js applyFilter */
export function BulkStatsBar() {
  const rows = useBulkStore((s) => s.rows);
  const filter = useBulkStore((s) => s.filter);
  const setFilter = useBulkStore((s) => s.setFilter);

  const visibleCount = rows.filter((r) =>
    filter === 'all' ? true : filter === 'valid' ? r.isValid : !r.isValid,
  ).length;

  return (
    <div className="flex items-center gap-1.5 text-sm">
      <span className="text-gray-500">表示:</span>
      {FILTERS.map(({ key, label }) => (
        <button
          key={key}
          type="button"
          onClick={() => setFilter(key)}
          className={cn(
            'inline-flex h-7 items-center whitespace-nowrap rounded-full px-3 text-xs font-medium transition-colors',
            filter === key ? 'bg-blue-100 text-blue-800' : 'bg-gray-100 text-gray-600 hover:bg-gray-200',
          )}
        >
          {label}
        </button>
      ))}
      {filter !== 'all' && <span className="whitespace-nowrap text-xs text-gray-500">({visibleCount}件表示中)</span>}
    </div>
  );
}
