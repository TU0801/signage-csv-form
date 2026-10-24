import { useMemo, useState } from 'react';
import { Button } from '@/components/ui/Button';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { useToast } from '@/components/ui/Toast';
import type { DbInspectionType } from '@/types/database';
import type { AddSummary, VendorInspectionWithType } from '../api';
import { fetchMasterCategories } from '@/lib/api/masterData';
import type { RemoveSummary } from '../hooks/useRelationships';
import { confirmNameList, filterInspectionLinks, sortInspectionLinks } from '../lib/linkedList';
import { CheckListSelectModal, type CheckOption } from './CheckListSelectModal';
import { LinkedListToolbar, SelectAllCheckbox, useRowSelection } from './LinkedListParts';

const UNCATEGORIZED = '未分類';

interface InspectionRelationsProps {
  /** 確認の文言に出す保守会社名 */
  vendorName: string;
  /** active の紐付けだけ（解除済み inactive は取得しない） */
  vendorInspections: VendorInspectionWithType[];
  loadAvailableInspectionTypes: () => Promise<DbInspectionType[]>;
  onAdd: (inspectionIds: string[]) => Promise<AddSummary>;
  onRemove: (id: string) => Promise<void>;
  onRemoveMany: (ids: string[]) => Promise<RemoveSummary>;
  /** 閲覧のみ（管理会社。保守会社ごとの点検種別は全社共通なので、追加・解除を出さない） */
  readOnly?: boolean;
}

const nameOf = (vi: VendorInspectionWithType) => vi.signage_master_inspection_types?.inspection_name || '-';

// v1: js/admin-relationships.js renderVendorInspectionRelationships
export function InspectionRelations({
  vendorName,
  vendorInspections,
  loadAvailableInspectionTypes,
  onAdd,
  onRemove,
  onRemoveMany,
  readOnly = false,
}: InspectionRelationsProps) {
  const { addToast } = useToast();
  const [options, setOptions] = useState<CheckOption[]>([]);
  const [groups, setGroups] = useState<string[]>([]);
  const [modalOpen, setModalOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<VendorInspectionWithType | null>(null);
  const [bulkConfirmOpen, setBulkConfirmOpen] = useState(false);
  // 解除を送っている間（一括解除を二重に送らない）
  const [removing, setRemoving] = useState(false);
  const [query, setQuery] = useState('');

  // 取得は登録日の新しい順なので、点検種別マスターの並び順に並べ直す
  const sorted = useMemo(() => sortInspectionLinks(vendorInspections), [vendorInspections]);
  const visible = filterInspectionLinks(sorted, query);
  const selection = useRowSelection(vendorInspections, visible);
  const selectedRows = sorted.filter((vi) => selection.isSelected(vi.id));

  // v1: js/admin-relationships.js openAddInspectionModal
  const openModal = async () => {
    try {
      const available = await loadAvailableInspectionTypes();
      if (available.length === 0) {
        addToast('すべての点検種別が既に紐付けられています', 'info');
        return;
      }
      // 分類ボタンの並びはカテゴリマスターの順。読めなくても追加はできるように、失敗したら候補に出てくる順にする
      const categoryOrder = await fetchMasterCategories()
        .then((cs) => cs.map((c) => c.category_name))
        .catch(() => [] as string[]);
      const nextOptions = available.map((i) => ({
        value: i.id,
        label: i.inspection_name,
        meta: i.category || UNCATEGORIZED,
        group: i.category || UNCATEGORIZED,
      }));
      const present = new Set(nextOptions.map((o) => o.group));
      setGroups([
        ...categoryOrder.filter((c) => present.has(c)),
        ...[...present].filter((g) => !categoryOrder.includes(g)),
      ]);
      setOptions(nextOptions);
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

  return (
    <div className="space-y-3">
      <LinkedListToolbar
        summary={`${vendorInspections.length}件の点検種別が紐付けられています`}
        shownCount={query ? visible.length : null}
        query={query}
        onQueryChange={setQuery}
        searchLabel="紐付け済みの点検種別を検索"
        searchPlaceholder="点検種別名・カテゴリで検索"
        selectedCount={readOnly ? 0 : selection.selectedIds.length}
        onRemoveSelected={() => setBulkConfirmOpen(true)}
        removing={removing}
        addButton={
          readOnly ? null : (
            <Button size="sm" onClick={openModal}>
              ＋ 点検種別を追加
            </Button>
          )
        }
      />
      {readOnly && (
        <p className="text-xs text-gray-500">
          保守会社ごとの点検種別は全社共通の設定のため、閲覧のみです（変更は管理者が行います）
        </p>
      )}

      {vendorInspections.length === 0 ? (
        <p className="py-8 text-center text-sm text-gray-500">紐付けがありません</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200 text-left">
                {!readOnly && (
                  <th className="cell-head w-8">
                    <SelectAllCheckbox selection={selection} />
                  </th>
                )}
                <th className="cell-head font-medium text-gray-700">点検種別</th>
                <th className="cell-head font-medium text-gray-700">カテゴリ</th>
                <th className="cell-head font-medium text-gray-700">登録日</th>
                {!readOnly && (
                  <th className="cell-head font-medium text-gray-700 sticky right-0 bg-white shadow-[inset_1px_0_0_var(--color-gray-200)]">操作</th>
                )}
              </tr>
            </thead>
            <tbody>
              {visible.length === 0 ? (
                <tr>
                  <td colSpan={readOnly ? 3 : 5} className="py-8 text-center text-gray-400">
                    検索結果がありません
                  </td>
                </tr>
              ) : (
                visible.map((vi) => (
                  <tr key={vi.id} className="group border-b border-gray-100 hover:bg-gray-50">
                    {!readOnly && (
                      <td className="cell">
                        <input
                          type="checkbox"
                          className="rounded border-gray-300"
                          aria-label={`${nameOf(vi)} を選択`}
                          checked={selection.isSelected(vi.id)}
                          onChange={() => selection.toggle(vi.id)}
                        />
                      </td>
                    )}
                    <td className="cell">{nameOf(vi)}</td>
                    <td className="cell whitespace-nowrap">{vi.signage_master_inspection_types?.category || '-'}</td>
                    <td className="cell whitespace-nowrap">
                      {vi.created_at ? new Date(vi.created_at).toLocaleDateString('ja-JP') : '-'}
                    </td>
                    {!readOnly && (
                      <td className="cell sticky right-0 bg-white shadow-[inset_1px_0_0_var(--color-gray-200)] group-hover:bg-gray-50">
                        <Button variant="danger" size="sm" className="-my-0.5" disabled={removing} onClick={() => setDeleteTarget(vi)}>
                          解除
                        </Button>
                      </td>
                    )}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}

      <CheckListSelectModal
        open={modalOpen}
        title="点検種別を追加"
        description="追加する点検種別を選択してください（複数選択可）。名前で検索するか、分類のボタンで絞り込めます（ひらがな・カタカナ、全角・半角は区別しません）。"
        searchPlaceholder="点検種別・分類で検索"
        options={options}
        groups={groups}
        columns={4}
        onClose={() => setModalOpen(false)}
        onConfirm={handleConfirm}
      />

      {/* 押し間違いに気づけるよう、どの点検種別の紐付けかを名前で出す */}
      <ConfirmDialog
        open={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={handleRemove}
        title="紐付けの解除"
        message={deleteTarget ? `「${vendorName}」と「${nameOf(deleteTarget)}」の紐付けを解除しますか？` : ''}
        confirmLabel="解除"
        variant="danger"
      />

      <ConfirmDialog
        open={bulkConfirmOpen}
        onClose={() => setBulkConfirmOpen(false)}
        onConfirm={() => void handleRemoveSelected()}
        title="紐付けの解除"
        message={`「${vendorName}」と次の ${selectedRows.length} 件の点検種別の紐付けを解除しますか？\n${confirmNameList(selectedRows.map(nameOf))}`}
        confirmLabel={`${selectedRows.length}件を解除`}
        variant="danger"
      />
    </div>
  );
}
