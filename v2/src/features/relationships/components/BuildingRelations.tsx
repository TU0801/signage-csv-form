import { useState } from 'react';
import { Button } from '@/components/ui/Button';
import { Select } from '@/components/ui/Select';
import { Badge } from '@/components/ui/Badge';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { useToast } from '@/components/ui/Toast';
import type { DbBuildingVendor, DbProperty } from '@/types/database';

interface BuildingRelationsProps {
  buildingVendors: DbBuildingVendor[];
  properties: DbProperty[];
  onAdd: (propertyCode: string) => Promise<void>;
  onRemove: (id: string) => Promise<void>;
}

export function BuildingRelations({
  buildingVendors,
  properties,
  onAdd,
  onRemove,
}: BuildingRelationsProps) {
  const { addToast } = useToast();
  const [selectedProperty, setSelectedProperty] = useState('');
  const [adding, setAdding] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);

  const assignedCodes = new Set(buildingVendors.map((bv) => bv.property_code));
  const availableProperties = properties.filter((p) => !assignedCodes.has(p.property_code));

  const propertyMap = new Map(properties.map((p) => [p.property_code, p.property_name]));

  const handleAdd = async () => {
    if (!selectedProperty) return;
    setAdding(true);
    try {
      await onAdd(selectedProperty);
      setSelectedProperty('');
      addToast('ビルを追加しました', 'success');
    } catch (err) {
      addToast(err instanceof Error ? err.message : '追加に失敗しました', 'error');
    } finally {
      setAdding(false);
    }
  };

  const handleRemove = async () => {
    if (!deleteTarget) return;
    try {
      await onRemove(deleteTarget);
      addToast('ビルを削除しました', 'success');
    } catch (err) {
      addToast(err instanceof Error ? err.message : '削除に失敗しました', 'error');
    } finally {
      setDeleteTarget(null);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex gap-3 items-end">
        <div className="flex-1">
          <Select
            label="ビルを追加"
            options={availableProperties.map((p) => ({
              value: p.property_code,
              label: `${p.property_code} - ${p.property_name}`,
            }))}
            placeholder="物件を選択..."
            value={selectedProperty}
            onChange={(e) => setSelectedProperty(e.target.value)}
          />
        </div>
        <Button onClick={handleAdd} disabled={!selectedProperty || adding} size="sm">
          追加
        </Button>
      </div>

      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-gray-200 text-left">
            <th className="py-2 px-3 font-medium text-gray-700">物件コード</th>
            <th className="py-2 px-3 font-medium text-gray-700">物件名</th>
            <th className="py-2 px-3 font-medium text-gray-700">ステータス</th>
            <th className="py-2 px-3 font-medium text-gray-700">操作</th>
          </tr>
        </thead>
        <tbody>
          {buildingVendors.length === 0 ? (
            <tr>
              <td colSpan={4} className="py-8 text-center text-gray-400">
                紐付けされたビルはありません
              </td>
            </tr>
          ) : (
            buildingVendors.map((bv) => (
              <tr key={bv.id} className="border-b border-gray-100 hover:bg-gray-50">
                <td className="py-2 px-3">{bv.property_code}</td>
                <td className="py-2 px-3">{propertyMap.get(bv.property_code) ?? '-'}</td>
                <td className="py-2 px-3">
                  <Badge
                    variant={
                      bv.status === 'active'
                        ? 'success'
                        : bv.status === 'pending'
                          ? 'warning'
                          : 'danger'
                    }
                  >
                    {bv.status}
                  </Badge>
                </td>
                <td className="py-2 px-3">
                  <Button
                    variant="danger"
                    size="sm"
                    onClick={() => setDeleteTarget(bv.id)}
                  >
                    削除
                  </Button>
                </td>
              </tr>
            ))
          )}
        </tbody>
      </table>

      <ConfirmDialog
        open={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={handleRemove}
        title="ビル紐付け削除"
        message="このビルの紐付けを削除しますか？"
        confirmLabel="削除"
        variant="danger"
      />
    </div>
  );
}
