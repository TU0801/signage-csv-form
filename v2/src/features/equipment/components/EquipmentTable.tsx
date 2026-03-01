import { Button } from '@/components/ui/Button';
import type { DbBuildingEquipment, DbInspectionType, DbVendor } from '@/types/database';

const MONTH_LABELS = ['1月', '2月', '3月', '4月', '5月', '6月', '7月', '8月', '9月', '10月', '11月', '12月'];

interface EquipmentTableProps {
  items: DbBuildingEquipment[];
  inspectionTypes: DbInspectionType[];
  vendors: DbVendor[];
  onDelete: (id: string) => void;
}

export function EquipmentTable({ items, inspectionTypes, vendors, onDelete }: EquipmentTableProps) {
  const getInspectionName = (id: string) =>
    inspectionTypes.find((t) => t.id === id)?.inspection_name ?? id;

  const getVendorName = (id: string | null) =>
    id ? (vendors.find((v) => v.id === id)?.vendor_name ?? id) : '-';

  const formatMonths = (months: number[] | null) =>
    months && months.length > 0 ? months.map((m) => MONTH_LABELS[m - 1] ?? m).join(', ') : '-';

  if (items.length === 0) {
    return <p className="text-sm text-gray-500 py-4 text-center">設備データがありません</p>;
  }

  return (
    <div className="overflow-x-auto">
      <table className="min-w-full text-sm">
        <thead>
          <tr className="border-b border-gray-200 bg-gray-50">
            <th className="px-3 py-2 text-left font-medium text-gray-600">点検種別</th>
            <th className="px-3 py-2 text-left font-medium text-gray-600">保守会社</th>
            <th className="px-3 py-2 text-left font-medium text-gray-600">点検月</th>
            <th className="px-3 py-2 text-left font-medium text-gray-600">備考</th>
            <th className="px-3 py-2 text-left font-medium text-gray-600">備考2</th>
            <th className="px-3 py-2 w-16"></th>
          </tr>
        </thead>
        <tbody>
          {items.map((item) => (
            <tr key={item.id} className="border-b border-gray-100 hover:bg-gray-50">
              <td className="px-3 py-2">{getInspectionName(item.inspection_type_id)}</td>
              <td className="px-3 py-2">{getVendorName(item.vendor_id)}</td>
              <td className="px-3 py-2">{formatMonths(item.inspection_months)}</td>
              <td className="px-3 py-2 max-w-[200px] truncate">{item.remarks ?? '-'}</td>
              <td className="px-3 py-2 max-w-[200px] truncate">{item.remarks2 ?? '-'}</td>
              <td className="px-3 py-2">
                <Button variant="danger" size="sm" onClick={() => onDelete(item.id)}>
                  削除
                </Button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
