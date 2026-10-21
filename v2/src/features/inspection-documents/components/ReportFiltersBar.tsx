import { Button } from '@/components/ui/Button';
import { DEFAULT_REPORT_FILTERS, type ReportFilters } from '../lib/documents';

interface ReportFiltersBarProps {
  filters: ReportFilters;
  onChange: (filters: ReportFilters) => void;
  /** 保守会社の絞り込み（管理者・管理会社だけ。保守会社は自社の分しか見えない） */
  vendorOptions: { value: string; label: string }[] | null;
}

const FIELD =
  'rounded-md border border-gray-300 px-1.5 py-1 text-xs focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500';

export function ReportFiltersBar({ filters, onChange, vendorOptions }: ReportFiltersBarProps) {
  const set = <K extends keyof ReportFilters>(key: K, value: ReportFilters[K]) => onChange({ ...filters, [key]: value });
  return (
    <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs">
      <input
        type="search"
        aria-label="検索"
        placeholder="ファイル名・建物・点検種別・保守会社"
        value={filters.search}
        onChange={(e) => set('search', e.target.value)}
        className={`${FIELD} w-60`}
      />
      <select
        aria-label="状態"
        value={filters.status}
        onChange={(e) => set('status', e.target.value as ReportFilters['status'])}
        className={FIELD}
      >
        <option value="">状態: すべて</option>
        <option value="submitted">提出（確認待ち）</option>
        <option value="accepted">受領</option>
        <option value="returned">差戻し</option>
      </select>
      <span className="flex items-center gap-1">
        <span className="text-gray-500">実施日</span>
        <input
          type="date"
          aria-label="実施日（から）"
          value={filters.from}
          onChange={(e) => set('from', e.target.value)}
          className={FIELD}
        />
        <span className="text-gray-400">〜</span>
        <input
          type="date"
          aria-label="実施日（まで）"
          value={filters.to}
          onChange={(e) => set('to', e.target.value)}
          className={FIELD}
        />
      </span>
      {vendorOptions && (
        <select
          aria-label="保守会社"
          value={filters.vendorId}
          onChange={(e) => set('vendorId', e.target.value)}
          className={`${FIELD} max-w-48`}
        >
          <option value="">保守会社: すべて</option>
          {vendorOptions.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      )}
      <label className="flex items-center gap-1 text-gray-600">
        <input type="checkbox" checked={filters.showDeleted} onChange={(e) => set('showDeleted', e.target.checked)} />
        削除済みも表示
      </label>
      <label className="flex items-center gap-1 text-gray-600">
        <input
          type="checkbox"
          checked={filters.showSuperseded}
          onChange={(e) => set('showSuperseded', e.target.checked)}
        />
        旧版も表示
      </label>
      <Button variant="ghost" size="sm" className="text-xs" onClick={() => onChange(DEFAULT_REPORT_FILTERS)}>
        条件をクリア
      </Button>
    </div>
  );
}
