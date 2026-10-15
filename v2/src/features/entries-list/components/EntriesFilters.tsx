import { Button } from '@/components/ui/Button';
import { Combobox } from '@/components/ui/Combobox';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import type { DbVendor } from '@/types/database';
import type { EntriesFilters as EntriesFiltersType } from '../hooks/useEntriesFilters';
import { sortVendors } from '@/lib/vendorOptions';

interface EntriesFiltersProps {
  filters: EntriesFiltersType;
  onUpdateFilter: <K extends keyof EntriesFiltersType>(key: K, value: EntriesFiltersType[K]) => void;
  /** すべての条件を空にする（既定の開始日も外す） */
  onClear: () => void;
  /** 今かかっている条件の説明（describeEntryFilters）。空なら全件 */
  activeConditions: string[];
  properties: { property_code: string; property_name: string }[];
  vendors: DbVendor[];
}

/**
 * 物件・点検開始日（期間）・保守会社で絞り込む。ステータスの絞り込みは無い（v1 と同じ）。
 * 開いたときは点検開始日が今日以降に絞られる（v1 と同じ既定）ので、何で絞っているかと「条件をクリア」を出す
 */
// v1: admin.html #tab-entries のフィルター / js/admin-entries.js populateFilters
export function EntriesFilters({
  filters,
  onUpdateFilter,
  onClear,
  activeConditions,
  properties,
  vendors,
}: EntriesFiltersProps) {
  // 物件は約250件あるので、コード・名前の途中の語でも探せる検索つきにする
  const propertyOptions = [
    { value: '', label: 'すべて' },
    ...properties.map((p) => ({
      value: p.property_code,
      label: `${p.property_code} ${p.property_name}`,
    })),
  ];

  const vendorOptions = sortVendors(vendors).map((v) => ({
    value: v.vendor_name,
    label: v.vendor_name,
  }));

  return (
    <div className="space-y-1">
      <div className="flex flex-wrap items-end gap-3">
        <div className="w-80">
          <Combobox
            label="物件"
            options={propertyOptions}
            placeholder="すべて"
            value={filters.propertyCode}
            onChange={(v) => onUpdateFilter('propertyCode', v)}
          />
        </div>
        <div className="w-44">
          <Input
            label="点検開始日（から）"
            type="date"
            value={filters.startDate}
            onChange={(e) => onUpdateFilter('startDate', e.target.value)}
          />
        </div>
        <div className="w-44">
          <Input
            label="点検開始日（まで）"
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
        <Button
          size="sm"
          variant="secondary"
          disabled={activeConditions.length === 0}
          onClick={onClear}
        >
          条件をクリア
        </Button>
      </div>
      <p className="text-xs text-gray-500">
        {activeConditions.length > 0
          ? `絞り込み中: ${activeConditions.join(' / ')}`
          : '絞り込みなし（承認済みをすべて表示）'}
        。開いたときは点検開始日が今日以降のものだけを表示します。
      </p>
    </div>
  );
}
