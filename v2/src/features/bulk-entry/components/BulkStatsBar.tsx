import { useBulkStore } from '@/stores/bulkStore';
import { Badge } from '@/components/ui/Badge';
import { cn } from '@/lib/utils';

export function BulkStatsBar() {
  const rows = useBulkStore((s) => s.rows);
  const filter = useBulkStore((s) => s.filter);
  const setFilter = useBulkStore((s) => s.setFilter);

  const total = rows.length;
  const validCount = rows.filter((r) => r._isValid).length;
  const errorCount = total - validCount;

  const filters: { key: 'all' | 'valid' | 'error'; label: string; count: number }[] = [
    { key: 'all', label: '全件', count: total },
    { key: 'valid', label: '有効', count: validCount },
    { key: 'error', label: 'エラー', count: errorCount },
  ];

  return (
    <div className="flex items-center gap-4">
      <span className="text-sm text-gray-600">
        合計: <strong>{total}</strong>件
      </span>
      <div className="flex items-center gap-1">
        {filters.map(({ key, label, count }) => (
          <button
            key={key}
            onClick={() => setFilter(key)}
            className={cn(
              'inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium transition-colors',
              filter === key
                ? 'bg-blue-100 text-blue-800'
                : 'bg-gray-100 text-gray-600 hover:bg-gray-200',
            )}
          >
            {label}
            <Badge
              variant={
                key === 'error' && count > 0
                  ? 'danger'
                  : key === 'valid'
                    ? 'success'
                    : 'default'
              }
            >
              {count}
            </Badge>
          </button>
        ))}
      </div>
    </div>
  );
}
