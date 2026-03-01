import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { Button } from '@/components/ui/Button';
import { EntryStatus } from '@/lib/constants';
import { useMasterData } from '@/hooks/useMasterData';
import type { EntriesFilters as EntriesFiltersType } from '../hooks/useEntriesFilters';

interface EntriesFiltersProps {
  filters: EntriesFiltersType;
  onUpdateFilter: <K extends keyof EntriesFiltersType>(key: K, value: EntriesFiltersType[K]) => void;
  onReset: () => void;
  hasActiveFilters: boolean;
}

const statusOptions = [
  { value: EntryStatus.PENDING, label: 'pending' },
  { value: EntryStatus.DRAFT, label: 'draft' },
  { value: EntryStatus.READY, label: 'ready' },
  { value: EntryStatus.EXPORTED, label: 'exported' },
];

export function EntriesFilters({
  filters,
  onUpdateFilter,
  onReset,
  hasActiveFilters,
}: EntriesFiltersProps) {
  const { properties } = useMasterData();

  const propertyOptions = properties.map((p) => ({
    value: p.property_code,
    label: `${p.property_code} - ${p.property_name}`,
  }));

  return (
    <div className="flex flex-wrap items-end gap-4">
      <div className="w-64">
        <Select
          label="物件コード"
          options={propertyOptions}
          placeholder="すべて"
          value={filters.propertyCode}
          onChange={(e) => onUpdateFilter('propertyCode', e.target.value)}
        />
      </div>
      <div className="w-40">
        <Select
          label="ステータス"
          options={statusOptions}
          placeholder="すべて"
          value={filters.status}
          onChange={(e) => onUpdateFilter('status', e.target.value as EntriesFiltersType['status'])}
        />
      </div>
      <div className="w-44">
        <Input
          label="表示開始日(from)"
          type="date"
          value={filters.dateFrom}
          onChange={(e) => onUpdateFilter('dateFrom', e.target.value)}
        />
      </div>
      <div className="w-44">
        <Input
          label="表示終了日(to)"
          type="date"
          value={filters.dateTo}
          onChange={(e) => onUpdateFilter('dateTo', e.target.value)}
        />
      </div>
      {hasActiveFilters && (
        <Button variant="ghost" size="sm" onClick={onReset}>
          フィルタをリセット
        </Button>
      )}
    </div>
  );
}
