import { useState } from 'react';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { useToast } from '@/components/ui/Toast';
import type { DbInspectionType } from '@/types/database';
import type { AddSummary, VendorInspectionWithType } from '../api';
import { PillSelectModal, type PillOption } from './PillSelectModal';

interface InspectionRelationsProps {
  /** active の紐付けだけ（解除済み inactive は取得しない） */
  vendorInspections: VendorInspectionWithType[];
  loadAvailableInspectionTypes: () => Promise<DbInspectionType[]>;
  onAdd: (inspectionIds: string[]) => Promise<AddSummary>;
  onRemove: (id: string) => Promise<void>;
}

// v1: js/admin-relationships.js renderVendorInspectionRelationships
export function InspectionRelations({
  vendorInspections,
  loadAvailableInspectionTypes,
  onAdd,
  onRemove,
}: InspectionRelationsProps) {
  const { addToast } = useToast();
  const [options, setOptions] = useState<PillOption[]>([]);
  const [modalOpen, setModalOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);

  // v1: js/admin-relationships.js openAddInspectionModal
  const openModal = async () => {
    try {
      const available = await loadAvailableInspectionTypes();
      if (available.length === 0) {
        addToast('すべての点検種別が既に紐付けられています', 'info');
        return;
      }
      setOptions(available.map((i) => ({ value: i.id, label: i.inspection_name })));
      setModalOpen(true);
    } catch {
      addToast('点検種別の取得に失敗しました', 'error');
    }
  };

  // v1: js/admin-relationships.js confirmInspectionSelection
  const handleConfirm = async (ids: string[]) => {
    setModalOpen(false);
    try {
      const summary = await onAdd(ids);
      addToast(summary.message, summary.type);
    } catch {
      addToast('追加に失敗しました', 'error');
    }
  };

  // v1: js/admin-relationships.js handleRemoveVendorInspection
  const handleRemove = async () => {
    if (!deleteTarget) return;
    const id = deleteTarget;
    setDeleteTarget(null);
    try {
      await onRemove(id);
      addToast('紐付けを削除しました', 'success');
    } catch {
      addToast('削除に失敗しました', 'error');
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-gray-500">
          {vendorInspections.length}件の点検種別が紐付けられています
        </p>
        <Button size="sm" onClick={openModal}>
          ＋ 点検種別を追加
        </Button>
      </div>

      {vendorInspections.length === 0 ? (
        <p className="py-8 text-center text-sm text-gray-500">紐付けがありません</p>
      ) : (
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-200 text-left">
              <th className="py-2 px-3 font-medium text-gray-700">点検種別</th>
              <th className="py-2 px-3 font-medium text-gray-700">カテゴリID</th>
              <th className="py-2 px-3 font-medium text-gray-700">ステータス</th>
              <th className="py-2 px-3 font-medium text-gray-700">登録日</th>
              <th className="py-2 px-3 font-medium text-gray-700">操作</th>
            </tr>
          </thead>
          <tbody>
            {vendorInspections.map((vi) => (
              <tr key={vi.id} className="border-b border-gray-100 hover:bg-gray-50">
                <td className="py-2 px-3">
                  {vi.signage_master_inspection_types?.inspection_name || '-'}
                </td>
                <td className="py-2 px-3">{vi.signage_master_inspection_types?.category || '-'}</td>
                <td className="py-2 px-3">
                  <Badge variant="success">有効</Badge>
                </td>
                <td className="py-2 px-3">
                  {vi.created_at ? new Date(vi.created_at).toLocaleDateString('ja-JP') : '-'}
                </td>
                <td className="py-2 px-3">
                  <Button variant="danger" size="sm" onClick={() => setDeleteTarget(vi.id)}>
                    削除
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <PillSelectModal
        open={modalOpen}
        title="点検種別を追加"
        description="追加する点検種別を選択してください（複数選択可）"
        options={options}
        onClose={() => setModalOpen(false)}
        onConfirm={handleConfirm}
      />

      <ConfirmDialog
        open={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={handleRemove}
        title="紐付けの削除"
        message="この点検種別の紐付けを削除してもよろしいですか？"
        confirmLabel="削除"
        variant="danger"
      />
    </div>
  );
}
