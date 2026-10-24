import { cn } from '@/lib/utils';
import { STATUS_LABEL, STATUS_TONE, type InspectionStatus } from '../lib/status';

/** ステータスのバッジ（点検登録フォームの行と点検一覧で共通） */
export function StatusBadge({ status, className }: { status: InspectionStatus; className?: string }) {
  return (
    <span
      className={cn(
        'inline-flex items-center whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-medium',
        STATUS_TONE[status],
        className,
      )}
      data-status={status}
    >
      {STATUS_LABEL[status]}
    </span>
  );
}
