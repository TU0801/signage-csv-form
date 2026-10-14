import { Button } from '@/components/ui/Button';
import type { DbEntry } from '@/types/database';
import { formatJaDate, formatJaDateTime } from '@/features/entries-list/lib/entries';

interface PendingEntryRowProps {
  entry: DbEntry;
  selected: boolean;
  propertyName: string | undefined;
  email: string;
  onToggleSelect: (id: string) => void;
  onApprove: (id: string) => void;
  onReject: (id: string) => void;
  onViewDetail: (entry: DbEntry) => void;
  onEdit: (entry: DbEntry) => void;
}

const td = 'px-3 py-2 text-sm text-gray-900';

// v1: js/admin-pending.js renderPendingEntries（1行分）
export function PendingEntryRow({
  entry,
  selected,
  propertyName,
  email,
  onToggleSelect,
  onApprove,
  onReject,
  onViewDetail,
  onEdit,
}: PendingEntryRowProps) {
  return (
    <tr className="border-b border-gray-100 hover:bg-gray-50">
      <td className={td}>
        <input
          type="checkbox"
          aria-label="選択"
          checked={selected}
          onChange={() => onToggleSelect(entry.id)}
          className="h-4 w-4 rounded border-gray-300 text-blue-600"
        />
      </td>
      <td className={td}>{entry.property_code}</td>
      <td className={td}>{propertyName || '-'}</td>
      <td className={td}>{entry.inspection_type}</td>
      <td className={td}>{formatJaDate(entry.inspection_start)}</td>
      <td className={td}>{formatJaDate(entry.inspection_end)}</td>
      <td className={td}>
        {entry.remarks ? (
          <div className="max-w-[150px] truncate" title={entry.remarks}>
            {entry.remarks}
          </div>
        ) : (
          '-'
        )}
      </td>
      <td className={td}>{entry.vendor_name || '-'}</td>
      <td className={`${td} whitespace-nowrap`}>{formatJaDateTime(entry.created_at)}</td>
      <td className={td}>{email}</td>
      <td className={td}>
        <div className="flex items-center gap-1">
          <Button size="sm" variant="ghost" onClick={() => onViewDetail(entry)}>
            詳細
          </Button>
          <Button size="sm" variant="ghost" onClick={() => onEdit(entry)}>
            編集
          </Button>
          <Button size="sm" variant="success" onClick={() => onApprove(entry.id)}>
            承認
          </Button>
          <Button size="sm" variant="danger" onClick={() => onReject(entry.id)}>
            却下
          </Button>
        </div>
      </td>
    </tr>
  );
}
