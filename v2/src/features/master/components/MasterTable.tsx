import { Button } from '@/components/ui/Button';
import type { MasterConfig } from '../types/masterConfig';

interface MasterTableProps<T extends Record<string, unknown>> {
  config: MasterConfig<T>;
  items: T[];
  onEdit: (item: T) => void;
  onDelete: (item: T) => void;
  renderCell?: (key: string, value: unknown, item: T) => React.ReactNode;
}

export function MasterTable<T extends Record<string, unknown>>({
  config,
  items,
  onEdit,
  onDelete,
  renderCell,
}: MasterTableProps<T>) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-gray-200 text-left">
            {config.columns.map((col) => (
              <th
                key={col.key}
                className="py-2 px-3 font-medium text-gray-700"
                style={col.width ? { width: col.width } : undefined}
              >
                {col.label}
              </th>
            ))}
            <th className="py-2 px-3 font-medium text-gray-700 w-32">操作</th>
          </tr>
        </thead>
        <tbody>
          {items.length === 0 ? (
            <tr>
              <td colSpan={config.columns.length + 1} className="py-8 text-center text-gray-400">
                データがありません
              </td>
            </tr>
          ) : (
            items.map((item) => (
              <tr
                key={item['id'] as string}
                className="border-b border-gray-100 hover:bg-gray-50"
              >
                {config.columns.map((col) => (
                  <td key={col.key} className="py-2 px-3">
                    {renderCell
                      ? (renderCell(col.key, item[col.key], item) ?? formatCellValue(item[col.key]))
                      : formatCellValue(item[col.key])}
                  </td>
                ))}
                <td className="py-2 px-3">
                  <div className="flex gap-1">
                    <Button variant="ghost" size="sm" onClick={() => onEdit(item)}>
                      編集
                    </Button>
                    <Button variant="danger" size="sm" onClick={() => onDelete(item)}>
                      削除
                    </Button>
                  </div>
                </td>
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}

function formatCellValue(value: unknown): React.ReactNode {
  if (value === null || value === undefined) return '-';
  if (typeof value === 'boolean') return value ? 'はい' : 'いいえ';
  if (Array.isArray(value)) return `${value.length}件`;
  return String(value);
}
