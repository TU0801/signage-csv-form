import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import type { DbEntry } from '@/types/database';
import { formatDateSlash } from '@/lib/utils';

interface PendingEntryRowProps {
  entry: DbEntry;
  selected: boolean;
  onToggleSelect: (id: string) => void;
  onApprove: (id: string) => void;
  onReject: (id: string) => void;
  onViewDetail: (entry: DbEntry) => void;
}

export function PendingEntryRow({
  entry,
  selected,
  onToggleSelect,
  onApprove,
  onReject,
  onViewDetail,
}: PendingEntryRowProps) {
  return (
    <tr className="border-b border-gray-100 hover:bg-gray-50">
      <td className="px-4 py-3">
        <input
          type="checkbox"
          checked={selected}
          onChange={() => onToggleSelect(entry.id)}
          className="h-4 w-4 rounded border-gray-300 text-blue-600"
        />
      </td>
      <td className="px-4 py-3 text-sm text-gray-900">{entry.property_code}</td>
      <td className="px-4 py-3 text-sm text-gray-900">{entry.terminal_id}</td>
      <td className="px-4 py-3 text-sm text-gray-900">{entry.vendor_name}</td>
      <td className="px-4 py-3 text-sm text-gray-900">{entry.inspection_type}</td>
      <td className="px-4 py-3 text-sm text-gray-500">
        {entry.inspection_start ? formatDateSlash(entry.inspection_start) : '-'}
      </td>
      <td className="px-4 py-3">
        <Badge variant="default">draft</Badge>
      </td>
      <td className="px-4 py-3">
        <div className="flex items-center gap-2">
          <Button size="sm" variant="ghost" onClick={() => onViewDetail(entry)}>
            詳細
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
