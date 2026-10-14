import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import type { DbVendor } from '@/types/database';
import type { EntriesFilters as EntriesFiltersType } from '../hooks/useEntriesFilters';

interface EntriesFiltersProps {
  filters: EntriesFiltersType;
  onUpdateFilter: <K extends keyof EntriesFiltersType>(key: K, value: EntriesFiltersType[K]) => void;
  properties: { property_code: string; property_name: string }[];
  vendors: DbVendor[];
}

/** 物件・点検開始日（期間）・保守会社で絞り込む。ステータスの絞り込みとリセットボタンは無い（v1 と同じ） */
// v1: admin.html #tab-entries のフィルター / js/admin-entries.js populateFilters
export function EntriesFilters({
  filters,
  onUpdateFilter,
  properties,
  vendors,
}: EntriesFiltersProps) {
  const propertyOptions = properties.map((p) => ({
    value: p.property_code,
    label: `${p.property_code} ${p.property_name}`,
  }));

  const vendorOptions = vendors.map((v) => ({
    value: v.vendor_name,
    label: v.vendor_name,
  }));

  return (
    <div className="flex flex-wrap items-end gap-4">
      <div className="w-64">
        <Select
          label="物件"
          options={propertyOptions}
          placeholder="すべて"
          value={filters.propertyCode}
          onChange={(e) => onUpdateFilter('propertyCode', e.target.value)}
        />
      </div>
      <div className="w-44">
        <Input
          label="期間（開始）"
          type="date"
          value={filters.startDate}
          onChange={(e) => onUpdateFilter('startDate', e.target.value)}
        />
      </div>
      <div className="w-44">
        <Input
          label="期間（終了）"
          type="date"
          value={filters.endDate}
          onChange={(e) => onUpdateFilter('endDate', e.target.value)}
        />
      </div>
      <div className="w-48">
        <Select
          label="保守会社"
          options={vendorOptions}
          placeholder="すべて"
          value={filters.vendorName}
          onChange={(e) => onUpdateFilter('vendorName', e.target.value)}
        />
      </div>
    </div>
  );
}
