import { Button } from '@/components/ui/Button';
import type { ColumnDef } from '../types/masterConfig';

interface MasterTableProps<T extends { id: string }> {
  items: T[];
  columns: ColumnDef<T>[];
  onEdit: (item: T) => void;
  onDelete: (item: T) => void;
}

export function MasterTable<T extends { id: string }>({
  items,
  columns,
  onEdit,
  onDelete,
}: MasterTableProps<T>) {
  if (items.length === 0) {
    return <p className="text-sm text-gray-500 py-8 text-center">データがありません</p>;
  }

  return (
    <div className="overflow-x-auto border border-gray-200 rounded-md">
      <table className="min-w-full divide-y divide-gray-200">
        <thead className="bg-gray-50">
          <tr>
            {columns.map((col) => (
              <th
                key={col.key}
                className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase"
                style={col.width ? { width: col.width } : undefined}
              >
                {col.header}
              </th>
            ))}
            <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase w-32">
              操作
            </th>
          </tr>
        </thead>
        <tbody className="bg-white divide-y divide-gray-200">
          {items.map((item) => (
            <tr key={item.id} className="hover:bg-gray-50">
              {columns.map((col) => (
                <td key={col.key} className="px-4 py-3 text-sm text-gray-900 whitespace-nowrap">
                  {col.render ? col.render(item[col.key], item) : String(item[col.key] ?? '')}
                </td>
              ))}
              <td className="px-4 py-3 text-right">
                <div className="flex justify-end gap-2">
                  <Button variant="ghost" size="sm" onClick={() => onEdit(item)}>
                    編集
                  </Button>
                  <Button variant="ghost" size="sm" onClick={() => onDelete(item)}>
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
