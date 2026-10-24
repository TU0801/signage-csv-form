import { cn } from '@/lib/utils';
import type { StatusFilter } from '../lib/filters';
import { STATUS_LABEL, STATUS_ORDER, STATUS_TONE, type InspectionStatus } from '../lib/status';

interface CountBadgesProps {
  counts: Record<InspectionStatus, number>;
  /** 今のステータスの絞り込み（押したバッジを強調する） */
  active: StatusFilter;
  onSelect: (status: StatusFilter) => void;
}

/** ステータスごとの件数（通知の代わり）。押すとそのステータスで絞り込み、もう一度押すと外す。未申請は数が多いので出さない */
export function CountBadges({ counts, active, onSelect }: CountBadgesProps) {
  return (
    <div className="flex flex-wrap gap-1.5" role="group" aria-label="ステータスの件数">
      {STATUS_ORDER.filter((s) => s !== 'not_applied').map((status) => {
        const n = counts[status];
        const selected = active === status;
        return (
          <button
            key={status}
            type="button"
            aria-pressed={selected}
            onClick={() => onSelect(selected ? '' : status)}
            className={cn(
              'inline-flex items-center gap-1 rounded px-2 py-0.5 text-xs',
              n > 0 ? STATUS_TONE[status] : 'border border-gray-200 bg-white text-gray-500',
              selected && 'ring-2 ring-blue-500',
            )}
          >
            {STATUS_LABEL[status]}
            <span className="font-semibold tabular-nums">{n}</span>
          </button>
        );
      })}
    </div>
  );
}
