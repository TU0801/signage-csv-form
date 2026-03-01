import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import type { EntryFormData } from '@/types/app';

interface LocalEntry extends EntryFormData {
  _id: string;
}

interface EntryDataListProps {
  entries: LocalEntry[];
  onRemove: (id: string) => void;
  onEdit: (id: string) => void;
}

export function EntryDataList({ entries, onRemove, onEdit }: EntryDataListProps) {
  if (entries.length === 0) {
    return (
      <div className="text-center py-8 text-gray-400 text-sm">
        追加されたエントリーはありません
      </div>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="min-w-full text-sm">
        <thead>
          <tr className="border-b border-gray-200 text-left">
            <th className="px-3 py-2 font-medium text-gray-700">No.</th>
            <th className="px-3 py-2 font-medium text-gray-700">物件コード</th>
            <th className="px-3 py-2 font-medium text-gray-700">端末ID</th>
            <th className="px-3 py-2 font-medium text-gray-700">保守会社</th>
            <th className="px-3 py-2 font-medium text-gray-700">点検種別</th>
            <th className="px-3 py-2 font-medium text-gray-700">点検期間</th>
            <th className="px-3 py-2 font-medium text-gray-700">表示期間</th>
            <th className="px-3 py-2 font-medium text-gray-700">貼紙</th>
            <th className="px-3 py-2 font-medium text-gray-700">操作</th>
          </tr>
        </thead>
        <tbody>
          {entries.map((entry, index) => (
            <tr key={entry._id} className="border-b border-gray-100 hover:bg-gray-50">
              <td className="px-3 py-2 text-gray-500">{index + 1}</td>
              <td className="px-3 py-2">{entry.propertyCode}</td>
              <td className="px-3 py-2">{entry.terminalId}</td>
              <td className="px-3 py-2">{entry.vendorName}</td>
              <td className="px-3 py-2">{entry.inspectionType}</td>
              <td className="px-3 py-2 whitespace-nowrap">
                {entry.startDate} ~ {entry.endDate}
              </td>
              <td className="px-3 py-2 whitespace-nowrap">
                {entry.displayStartDate} ~ {entry.displayEndDate}
              </td>
              <td className="px-3 py-2">
                <Badge variant={entry.posterType === 'template' ? 'primary' : 'warning'}>
                  {entry.posterType === 'template' ? 'TPL' : 'カスタム'}
                </Badge>
              </td>
              <td className="px-3 py-2">
                <div className="flex gap-1">
                  <Button variant="ghost" size="sm" onClick={() => onEdit(entry._id)}>
                    編集
                  </Button>
                  <Button variant="ghost" size="sm" onClick={() => onRemove(entry._id)}>
                    削除
                  </Button>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
