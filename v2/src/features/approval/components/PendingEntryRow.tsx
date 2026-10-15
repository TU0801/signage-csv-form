import { Button } from '@/components/ui/Button';
import type { DbEntry } from '@/types/database';
import { formatJaDate, formatJaDateTime } from '@/features/entries-list/lib/entries';
import { NAME_CELL } from '@/features/entries-list/lib/tableColumns';

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

const td = 'cell text-sm text-gray-900';
const nowrap = `${td} whitespace-nowrap`;
// 画面が狭いときは表を横にスクロールし、操作の列だけ右端に残す（行のホバー色は group で合わせる）
const actions = `${td} sticky right-0 bg-white shadow-[inset_1px_0_0_var(--color-gray-200)] group-hover:bg-gray-50`;

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
    <tr className="group border-b border-gray-100 hover:bg-gray-50">
      <td className={td}>
        <input
          type="checkbox"
          aria-label="選択"
          checked={selected}
          onChange={() => onToggleSelect(entry.id)}
          className="h-4 w-4 rounded border-gray-300 text-blue-600"
        />
      </td>
      <td className={nowrap}>{entry.property_code}</td>
      <td className={td}>
        <div className={NAME_CELL} title={propertyName || undefined}>
          {propertyName || '-'}
        </div>
      </td>
      <td className={td}>
        <div className={NAME_CELL} title={entry.inspection_type || undefined}>
          {entry.inspection_type}
        </div>
      </td>
      <td className={nowrap}>{formatJaDate(entry.inspection_start)}</td>
      <td className={nowrap}>{formatJaDate(entry.inspection_end)}</td>
      <td className={td}>
        {entry.remarks ? (
          <div className={NAME_CELL} title={entry.remarks}>
            {entry.remarks}
          </div>
        ) : (
          '-'
        )}
      </td>
      <td className={td}>
        <div className={NAME_CELL} title={entry.vendor_name || undefined}>
          {entry.vendor_name || '-'}
        </div>
      </td>
      <td className={nowrap}>{formatJaDateTime(entry.created_at)}</td>
      <td className={td}>
        <div className={NAME_CELL} title={email}>
          {email}
        </div>
      </td>
      <td className={actions}>
        {/* ボタン（28px）は上下 2px をセルの余白に重ねて、行の高さを 33px に抑える */}
        <div className="-my-0.5 flex items-center gap-1">
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
