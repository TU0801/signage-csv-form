import { useMemo, useState } from 'react';
import { Button } from '@/components/ui/Button';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { useToast } from '@/components/ui/Toast';
import type { DbBuildingVendor, DbProperty } from '@/types/database';
import type { AddSummary } from '../api';
import type { RemoveSummary } from '../hooks/useRelationships';
import { confirmNameList, filterBuildingLinks, sortBuildingLinks } from '../lib/linkedList';
import { CheckListSelectModal, type CheckOption } from './CheckListSelectModal';
import { LinkedListToolbar, SelectAllCheckbox, useRowSelection } from './LinkedListParts';

interface BuildingRelationsProps {
  /** 確認の文言に出す保守会社名 */
  vendorName: string;
  /** active の紐付けだけ */
  buildingVendors: DbBuildingVendor[];
  properties: Pick<DbProperty, 'property_code' | 'property_name'>[];
  loadAvailableProperties: () => Promise<Pick<DbProperty, 'property_code' | 'property_name' | 'terminals'>[]>;
  onAdd: (propertyCodes: string[]) => Promise<AddSummary>;
  onRemove: (id: string) => Promise<void>;
  onRemoveMany: (ids: string[]) => Promise<RemoveSummary>;
}

// v1: js/admin-relationships.js renderBuildingVendorRelationships
export function BuildingRelations({
  vendorName,
  buildingVendors,
  properties,
  loadAvailableProperties,
  onAdd,
  onRemove,
  onRemoveMany,
}: BuildingRelationsProps) {
  const { addToast } = useToast();
  const [options, setOptions] = useState<CheckOption[]>([]);
  const [modalOpen, setModalOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<DbBuildingVendor | null>(null);
  const [bulkConfirmOpen, setBulkConfirmOpen] = useState(false);
  // 解除を送っている間（一括解除を二重に送らない）
  const [removing, setRemoving] = useState(false);
  const [query, setQuery] = useState('');

  const propertyMap = useMemo(
    () => new Map(properties.map((p) => [String(p.property_code), p.property_name])),
    [properties],
  );
  const nameOf = (code: string) => propertyMap.get(code);
  const labelOf = (bv: DbBuildingVendor) => `${bv.property_code} ${nameOf(String(bv.property_code)) ?? ''}`.trim();

  // 取得は登録日の新しい順なので、物件コード順に並べ直す
  const sorted = useMemo(() => sortBuildingLinks(buildingVendors), [buildingVendors]);
  const visible = filterBuildingLinks(sorted, (code) => propertyMap.get(code), query);
  const selection = useRowSelection(buildingVendors, visible);

  // v1: js/admin-relationships.js openAddBuildingModal
  const openModal = async () => {
    try {
      const available = await loadAvailableProperties();
      if (available.length === 0) {
        addToast('すべての物件が既に紐付けられています', 'info');
        return;
      }
      setOptions(
        available.map((p) => {
          const terminalCount = Array.isArray(p.terminals) ? p.terminals.length : 0;
          return {
            value: String(p.property_code),
            label: p.property_name,
            code: String(p.property_code),
            meta: terminalCount > 0 ? `端末${terminalCount}台` : '端末なし',
          };
        }),
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
    if (!deleteTarget || removing) return;
    const id = deleteTarget.id;
    setDeleteTarget(null);
    setRemoving(true);
    try {
      await onRemove(id);
      selection.drop([id]);
      addToast('紐付けを解除しました', 'success');
    } catch {
      addToast('解除に失敗しました', 'error');
    } finally {
      setRemoving(false);
    }
  };

  const handleRemoveSelected = async () => {
    const ids = selection.selectedIds;
    setBulkConfirmOpen(false);
    if (removing || ids.length === 0) return;
    setRemoving(true);
    try {
      const { removed, failed } = await onRemoveMany(ids);
      selection.clear();
      if (removed > 0) addToast(`${removed}件の紐付けを解除しました`, 'success');
      if (failed > 0) addToast(`${failed}件の解除に失敗しました`, 'error');
    } catch {
      addToast('解除に失敗しました', 'error');
    } finally {
      setRemoving(false);
    }
  };

  const selectedRows = sorted.filter((bv) => selection.isSelected(bv.id));

  return (
    <div className="space-y-3">
      <LinkedListToolbar
        summary={`${buildingVendors.length}件の物件が紐付けられています`}
        shownCount={query ? visible.length : null}
        query={query}
        onQueryChange={setQuery}
        searchLabel="紐付け済みの物件を検索"
        searchPlaceholder="物件コード・物件名で検索"
        selectedCount={selection.selectedIds.length}
        onRemoveSelected={() => setBulkConfirmOpen(true)}
        removing={removing}
        addButton={
          <Button size="sm" onClick={openModal}>
            ＋ ビルを追加
          </Button>
        }
      />

      {buildingVendors.length === 0 ? (
        <p className="py-8 text-center text-sm text-gray-500">紐付けがありません</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200 text-left">
                <th className="cell-head w-8">
                  <SelectAllCheckbox selection={selection} />
                </th>
                <th className="cell-head font-medium text-gray-700">物件コード</th>
                <th className="cell-head font-medium text-gray-700">物件名</th>
                <th className="cell-head font-medium text-gray-700">登録日</th>
                <th className="cell-head font-medium text-gray-700 sticky right-0 bg-white shadow-[inset_1px_0_0_var(--color-gray-200)]">操作</th>
              </tr>
            </thead>
            <tbody>
              {visible.length === 0 ? (
                <tr>
                  <td colSpan={5} className="py-8 text-center text-gray-400">
                    検索結果がありません
                  </td>
                </tr>
              ) : (
                visible.map((bv) => {
                  const name = nameOf(String(bv.property_code));
                  return (
                    <tr key={bv.id} className="group border-b border-gray-100 hover:bg-gray-50">
                      <td className="cell">
                        <input
                          type="checkbox"
                          className="rounded border-gray-300"
                          aria-label={`${labelOf(bv)} を選択`}
                          checked={selection.isSelected(bv.id)}
                          onChange={() => selection.toggle(bv.id)}
                        />
                      </td>
                      <td className="cell whitespace-nowrap">{bv.property_code}</td>
                      <td className="cell">
                        <div className="max-w-[32rem] truncate" title={name || undefined}>
                          {name || '-'}
                        </div>
                      </td>
                      <td className="cell whitespace-nowrap">
                        {bv.created_at ? new Date(bv.created_at).toLocaleDateString('ja-JP') : '-'}
                      </td>
                      <td className="cell sticky right-0 bg-white shadow-[inset_1px_0_0_var(--color-gray-200)] group-hover:bg-gray-50">
                        <Button variant="danger" size="sm" className="-my-0.5" disabled={removing} onClick={() => setDeleteTarget(bv)}>
                          解除
                        </Button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      )}

      <CheckListSelectModal
        open={modalOpen}
        title="物件を追加"
        description="追加する物件を選択してください（複数選択可）。物件名・物件コードで絞り込めます（ひらがな・カタカナ、全角・半角は区別しません）。"
        searchPlaceholder="物件コード・物件名で検索"
        options={options}
        onClose={() => setModalOpen(false)}
        onConfirm={handleConfirm}
      />

      {/* 押し間違いに気づけるよう、どの物件の紐付けかを名前で出す */}
      <ConfirmDialog
        open={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={handleRemove}
        title="紐付けの解除"
        message={deleteTarget ? `「${vendorName}」と「${labelOf(deleteTarget)}」の紐付けを解除しますか？` : ''}
        confirmLabel="解除"
        variant="danger"
      />

      <ConfirmDialog
        open={bulkConfirmOpen}
        onClose={() => setBulkConfirmOpen(false)}
        onConfirm={() => void handleRemoveSelected()}
        title="紐付けの解除"
        message={`「${vendorName}」と次の ${selectedRows.length} 件の物件の紐付けを解除しますか？\n${confirmNameList(selectedRows.map(labelOf))}`}
        confirmLabel={`${selectedRows.length}件を解除`}
        variant="danger"
      />
    </div>
  );
}
