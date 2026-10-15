import { useState } from 'react';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { useToast } from '@/components/ui/Toast';
import type { DbBuildingVendor, DbProperty } from '@/types/database';
import type { AddSummary } from '../api';
import { PillSelectModal, type PillOption } from './PillSelectModal';

interface BuildingRelationsProps {
  /** active の紐付けだけ */
  buildingVendors: DbBuildingVendor[];
  properties: Pick<DbProperty, 'property_code' | 'property_name'>[];
  loadAvailableProperties: () => Promise<Pick<DbProperty, 'property_code' | 'property_name'>[]>;
  onAdd: (propertyCodes: string[]) => Promise<AddSummary>;
  onRemove: (id: string) => Promise<void>;
}

// v1: js/admin-relationships.js renderBuildingVendorRelationships
export function BuildingRelations({
  buildingVendors,
  properties,
  loadAvailableProperties,
  onAdd,
  onRemove,
}: BuildingRelationsProps) {
  const { addToast } = useToast();
  const [options, setOptions] = useState<PillOption[]>([]);
  const [modalOpen, setModalOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);

  const propertyMap = new Map(properties.map((p) => [String(p.property_code), p.property_name]));

  // v1: js/admin-relationships.js openAddBuildingModal
  const openModal = async () => {
    try {
      const available = await loadAvailableProperties();
      if (available.length === 0) {
        addToast('すべての物件が既に紐付けられています', 'info');
        return;
      }
      setOptions(
        available.map((p) => ({
          value: String(p.property_code),
          label: `${p.property_name}（${p.property_code}）`,
        })),
      );
      setModalOpen(true);
    } catch {
      addToast('物件の取得に失敗しました', 'error');
    }
  };

  // v1: js/admin-relationships.js confirmBuildingSelection
  const handleConfirm = async (codes: string[]) => {
    setModalOpen(false);
    try {
      const summary = await onAdd(codes);
      addToast(summary.message, summary.type);
    } catch {
      addToast('追加に失敗しました', 'error');
    }
  };

  // v1: js/admin-relationships.js handleRemoveBuildingVendor
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
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-sm text-gray-500">{buildingVendors.length}件の物件が紐付けられています</p>
        <Button size="sm" onClick={openModal}>
          ＋ ビルを追加
        </Button>
      </div>

      {buildingVendors.length === 0 ? (
        <p className="py-8 text-center text-sm text-gray-500">紐付けがありません</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200 text-left">
                <th className="cell-head font-medium text-gray-700">物件コード</th>
                <th className="cell-head font-medium text-gray-700">物件名</th>
                <th className="cell-head font-medium text-gray-700">ステータス</th>
                <th className="cell-head font-medium text-gray-700">登録日</th>
                <th className="cell-head font-medium text-gray-700 sticky right-0 bg-white shadow-[inset_1px_0_0_var(--color-gray-200)]">操作</th>
              </tr>
            </thead>
            <tbody>
              {buildingVendors.map((bv) => (
                <tr key={bv.id} className="group border-b border-gray-100 hover:bg-gray-50">
                  <td className="cell whitespace-nowrap">{bv.property_code}</td>
                  <td className="cell">
                    <div
                      className="max-w-[16rem] truncate"
                      title={propertyMap.get(String(bv.property_code)) || undefined}
                    >
                      {propertyMap.get(String(bv.property_code)) || '-'}
                    </div>
                  </td>
                  <td className="cell whitespace-nowrap">
                    <Badge variant="success">有効</Badge>
                  </td>
                  <td className="cell whitespace-nowrap">
                    {bv.created_at ? new Date(bv.created_at).toLocaleDateString('ja-JP') : '-'}
                  </td>
                  <td className="cell sticky right-0 bg-white shadow-[inset_1px_0_0_var(--color-gray-200)] group-hover:bg-gray-50">
                    <Button variant="danger" size="sm" className="-my-0.5" onClick={() => setDeleteTarget(bv.id)}>
                      削除
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <PillSelectModal
        open={modalOpen}
        title="物件を追加"
        description="追加する物件を選択してください（複数選択可）"
        options={options}
        onClose={() => setModalOpen(false)}
        onConfirm={handleConfirm}
      />

      <ConfirmDialog
        open={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={handleRemove}
        title="紐付けの削除"
        message="この紐付けを削除してもよろしいですか？"
        confirmLabel="削除"
        variant="danger"
      />
    </div>
  );
}
