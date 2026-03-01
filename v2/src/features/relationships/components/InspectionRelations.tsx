import { useState } from 'react';
import { Button } from '@/components/ui/Button';
import { Select } from '@/components/ui/Select';
import { Badge } from '@/components/ui/Badge';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { useToast } from '@/components/ui/Toast';
import type { DbVendorInspection, DbInspectionType } from '@/types/database';

interface InspectionRelationsProps {
  vendorInspections: DbVendorInspection[];
  inspectionTypes: DbInspectionType[];
  onAdd: (inspectionId: string) => Promise<void>;
  onRemove: (id: string) => Promise<void>;
  onToggleStatus: (id: string, currentStatus: 'active' | 'inactive') => Promise<void>;
}

export function InspectionRelations({
  vendorInspections,
  inspectionTypes,
  onAdd,
  onRemove,
  onToggleStatus,
}: InspectionRelationsProps) {
  const { addToast } = useToast();
  const [selectedInspection, setSelectedInspection] = useState('');
  const [adding, setAdding] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);

  const assignedIds = new Set(vendorInspections.map((vi) => vi.inspection_id));
  const availableInspections = inspectionTypes.filter((it) => !assignedIds.has(it.id));

  const inspectionMap = new Map(inspectionTypes.map((it) => [it.id, it.inspection_name]));

  const handleAdd = async () => {
    if (!selectedInspection) return;
    setAdding(true);
    try {
      await onAdd(selectedInspection);
      setSelectedInspection('');
      addToast('点検種別を追加しました', 'success');
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
      addToast('点検種別を削除しました', 'success');
    } catch (err) {
      addToast(err instanceof Error ? err.message : '削除に失敗しました', 'error');
    } finally {
      setDeleteTarget(null);
    }
  };

  const handleToggle = async (id: string, status: 'active' | 'inactive') => {
    try {
      await onToggleStatus(id, status);
      addToast('ステータスを変更しました', 'success');
    } catch (err) {
      addToast(err instanceof Error ? err.message : '変更に失敗しました', 'error');
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex gap-3 items-end">
        <div className="flex-1">
          <Select
            label="点検種別を追加"
            options={availableInspections.map((it) => ({
              value: it.id,
              label: it.inspection_name,
            }))}
            placeholder="点検種別を選択..."
            value={selectedInspection}
            onChange={(e) => setSelectedInspection(e.target.value)}
          />
        </div>
        <Button onClick={handleAdd} disabled={!selectedInspection || adding} size="sm">
          追加
        </Button>
      </div>

      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-gray-200 text-left">
            <th className="py-2 px-3 font-medium text-gray-700">点検種別</th>
            <th className="py-2 px-3 font-medium text-gray-700">ステータス</th>
            <th className="py-2 px-3 font-medium text-gray-700">操作</th>
          </tr>
        </thead>
        <tbody>
          {vendorInspections.length === 0 ? (
            <tr>
              <td colSpan={3} className="py-8 text-center text-gray-400">
                紐付けされた点検種別はありません
              </td>
            </tr>
          ) : (
            vendorInspections.map((vi) => (
              <tr key={vi.id} className="border-b border-gray-100 hover:bg-gray-50">
                <td className="py-2 px-3">{inspectionMap.get(vi.inspection_id) ?? '-'}</td>
                <td className="py-2 px-3">
                  <Badge variant={vi.status === 'active' ? 'success' : 'default'}>
                    {vi.status}
                  </Badge>
                </td>
                <td className="py-2 px-3 flex gap-2">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleToggle(vi.id, vi.status)}
                  >
                    {vi.status === 'active' ? '無効化' : '有効化'}
                  </Button>
                  <Button
                    variant="danger"
                    size="sm"
                    onClick={() => setDeleteTarget(vi.id)}
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
        title="点検種別紐付け削除"
        message="この点検種別の紐付けを削除しますか？"
        confirmLabel="削除"
        variant="danger"
      />
    </div>
  );
}
