import { Button } from '@/components/ui/Button';
import { INITIAL_FILTERS, STATUS_OPTIONS, TIMING_OPTIONS, type PortalFilters, type StatusFilter, type TimingFilter } from '../lib/filters';

interface PortalFilterBarProps {
  filters: PortalFilters;
  onChange: (next: PortalFilters) => void;
  /** 保守会社の選択肢（管理者・管理会社のとき。保守会社のアカウントは null） */
  vendorOptions: { value: string; label: string }[] | null;
}

const selectClass = 'rounded border border-gray-300 bg-white px-1.5 py-1 text-xs';

/** 点検一覧の絞り込み（1行に詰める） */
export function PortalFilterBar({ filters, onChange, vendorOptions }: PortalFilterBarProps) {
  const set = (patch: Partial<PortalFilters>) => onChange({ ...filters, ...patch });
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <select
        aria-label="時期"
        className={selectClass}
        value={filters.timing}
        onChange={(e) => set({ timing: e.target.value as TimingFilter })}
      >
        {TIMING_OPTIONS.map((o) => (
          <option key={o.value} value={o.value}>
            時期: {o.label}
          </option>
        ))}
      </select>
      <select
        aria-label="ステータス"
        className={selectClass}
        value={filters.status}
        onChange={(e) => set({ status: e.target.value as StatusFilter })}
      >
        {STATUS_OPTIONS.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
      <input
        type="search"
        aria-label="物件名・コードで検索"
        placeholder="物件名・コード"
        className="w-40 rounded border border-gray-300 bg-white px-1.5 py-1 text-xs"
        value={filters.search}
        onChange={(e) => set({ search: e.target.value })}
      />
      {vendorOptions && (
        <select
          aria-label="保守会社"
          className={`${selectClass} max-w-[12rem]`}
          value={filters.vendorId}
          onChange={(e) => set({ vendorId: e.target.value })}
        >
          <option value="">保守会社: すべて</option>
          {vendorOptions.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      )}
      <Button
        variant="ghost"
        size="sm"
        className="text-xs"
        onClick={() => onChange(INITIAL_FILTERS)}
      >
        条件を戻す
      </Button>
    </div>
  );
}
