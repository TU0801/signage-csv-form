import { cn } from '@/lib/utils';
import type { ScheduleCounts } from '../lib/schedule';
import { COUNT_TO_STATUS, type StatusFilter } from '../lib/filters';

const ITEMS: { key: keyof ScheduleCounts; label: string; tone: string }[] = [
  { key: 'overdueUnapplied', label: '点検月を過ぎて未申請', tone: 'border-red-300 bg-red-50 text-red-800' },
  { key: 'awaitingApproval', label: '承認待ち', tone: 'border-blue-300 bg-blue-50 text-blue-800' },
  { key: 'sentBack', label: '差戻し中', tone: 'border-amber-300 bg-amber-50 text-amber-800' },
  { key: 'reportsAwaitingReview', label: '報告書の確認待ち', tone: 'border-blue-300 bg-blue-50 text-blue-800' },
  { key: 'reportsReturned', label: '報告書の差戻し', tone: 'border-amber-300 bg-amber-50 text-amber-800' },
];

interface CountBadgesProps {
  counts: ScheduleCounts;
  /** 今の申請状況の絞り込み（押したバッジを強調する） */
  active: StatusFilter;
  onSelect: (status: StatusFilter) => void;
}

/** 件数バッジ（通知の代わり）。押すとその条件で絞り込み、もう一度押すと外す */
export function CountBadges({ counts, active, onSelect }: CountBadgesProps) {
  return (
    <div className="flex flex-wrap gap-1.5" role="group" aria-label="件数">
      {ITEMS.map(({ key, label, tone }) => {
        const status = COUNT_TO_STATUS[key];
        const n = counts[key];
        const selected = active === status;
        return (
          <button
            key={key}
            type="button"
            aria-pressed={selected}
            onClick={() => onSelect(selected ? '' : status)}
            className={cn(
              'inline-flex items-center gap-1 rounded border px-2 py-0.5 text-xs',
              n > 0 ? tone : 'border-gray-200 bg-white text-gray-500',
              selected && 'ring-2 ring-blue-500',
            )}
          >
            {label}
            <span className="font-semibold tabular-nums">{n}</span>
          </button>
        );
      })}
    </div>
  );
}
