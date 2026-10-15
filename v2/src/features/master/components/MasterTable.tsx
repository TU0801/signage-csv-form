import { Button } from '@/components/ui/Button';
import type { MasterConfig } from '../types/masterConfig';

interface MasterTableProps<T extends Record<string, unknown>> {
  config: Pick<MasterConfig<T>, 'columns' | 'readOnly'>;
  items: T[];
  onEdit: (item: T) => void;
  /** 省略すると各行の「削除」を出さない（物件のように削除を別システムで行う表） */
  onDelete?: (item: T) => void;
  renderCell?: (key: string, value: unknown, item: T) => React.ReactNode;
  /** 0件のときの文言（v1: 検索中は「検索結果がありません」） */
  emptyMessage?: string;
}

export function MasterTable<T extends Record<string, unknown>>({
  config,
  items,
  onEdit,
  onDelete,
  renderCell,
  emptyMessage = 'データがありません',
}: MasterTableProps<T>) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-gray-200 text-left">
            {config.columns.map((col) => (
              <th
                key={col.key}
                className="cell-head font-medium text-gray-700"
                style={col.width ? { width: col.width } : undefined}
              >
                {col.label}
              </th>
            ))}
            {!config.readOnly && (
              <th className="cell-head font-medium text-gray-700 w-32 sticky right-0 bg-white shadow-[inset_1px_0_0_var(--color-gray-200)]">操作</th>
            )}
          </tr>
        </thead>
        <tbody>
          {items.length === 0 ? (
            <tr>
              <td
                colSpan={config.columns.length + (config.readOnly ? 0 : 1)}
                className="py-8 text-center text-gray-400"
              >
                {emptyMessage}
              </td>
            </tr>
          ) : (
            items.map((item) => (
              <tr
                key={item['id'] as string}
                className="group border-b border-gray-100 hover:bg-gray-50"
              >
                {config.columns.map((col) => (
                  <td key={col.key} className="cell">
                    {renderCell
                      ? (renderCell(col.key, item[col.key], item) ?? formatCellValue(item[col.key]))
                      : formatCellValue(item[col.key])}
                  </td>
                ))}
                {!config.readOnly && (
                  <td className="cell sticky right-0 bg-white shadow-[inset_1px_0_0_var(--color-gray-200)] group-hover:bg-gray-50">
                    <div className="-my-0.5 flex gap-1">
                      <Button variant="ghost" size="sm" onClick={() => onEdit(item)}>
                        編集
                      </Button>
                      {onDelete && (
                        <Button variant="danger" size="sm" onClick={() => onDelete(item)}>
                          削除
                        </Button>
                      )}
                    </div>
                  </td>
                )}
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
