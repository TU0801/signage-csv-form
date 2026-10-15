import { useCallback, useEffect, useState } from 'react';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Spinner } from '@/components/ui/Spinner';
import { useToast } from '@/components/ui/Toast';
import { cn } from '@/lib/utils';
import {
  fetchMasterCategories,
  fetchMasterInspectionTypes,
  fetchTemplateImages,
} from '@/lib/api/masterData';
import {
  addInspectionType,
  updateInspectionType,
  updateInspectionSortOrder,
  deleteInspectionType,
  countEntriesByInspectionName,
  type InspectionTypeInput,
} from '@/lib/api/admin-masters';
import type { DbCategory, DbInspectionType, DbTemplateImage } from '@/types/database';
import type { MasterConfig } from '../types/masterConfig';
import { useMasterCRUD } from '../hooks/useMasterCRUD';
import { MasterToolbar } from '../components/MasterToolbar';
import { MasterDeleteConfirm } from '../components/MasterDeleteConfirm';
import { InspectionTypeFormModal } from '../components/InspectionTypeFormModal';
import { moveItem, sortOrderUpdates, templateLabel } from '../lib/inspectionTypes';

type InspectionTypeRecord = DbInspectionType & Record<string, unknown>;

const BIZ_TEMPLATE_SETTINGS_URL = 'https://system.1984.jp/settings?tab=template-images';

// 点検種別は signage_master_inspection_types を直接編集する（v1 と同じ。biz.inspection_types との同期は無い）
const config: MasterConfig<InspectionTypeRecord> = {
  api: {
    list: async () => (await fetchMasterInspectionTypes()) as InspectionTypeRecord[],
    remove: deleteInspectionType,
  },
  displayName: '点検種別',
  searchFields: ['inspection_name'],
  labelField: 'inspection_name',
  columns: [],
  formFields: [],
  defaultValues: {},
};

/** カテゴリとテンプレート画像（編集モーダルの選択肢） */
function useInspectionTypeOptions() {
  const [categories, setCategories] = useState<DbCategory[]>([]);
  const [templateImages, setTemplateImages] = useState<DbTemplateImage[]>([]);
  // 読み込み前に編集を開くと、テンプレートの選択肢が固定表だけのまま保存値を当てはめてしまう
  const [optionsLoading, setOptionsLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const [cats, images] = await Promise.all([
        fetchMasterCategories().catch(() => [] as DbCategory[]),
        fetchTemplateImages().catch(() => [] as DbTemplateImage[]),
      ]);
      if (cancelled) return;
      setCategories(cats);
      setTemplateImages(images);
      setOptionsLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return { categories, templateImages, optionsLoading };
}

// v1: js/admin-masters.js renderInspections / openMasterModal('inspection') / deleteMasterInspectionAction
export function InspectionTypesMaster() {
  const { addToast } = useToast();
  const { items, filteredItems, loading, error, search, setSearch, reload, deleteItem } =
    useMasterCRUD(config);
  const { categories, templateImages, optionsLoading } = useInspectionTypeOptions();

  const [formItem, setFormItem] = useState<DbInspectionType | null | undefined>(undefined);
  const [deleteTarget, setDeleteTarget] = useState<InspectionTypeRecord | null>(null);
  const [draggedId, setDraggedId] = useState<string | null>(null);
  const [overId, setOverId] = useState<string | null>(null);
  const [reordering, setReordering] = useState(false);

  // v1: js/admin-masters.js handleMasterFormSubmit（type === 'inspection'）
  const handleSubmit = useCallback(
    async (input: InspectionTypeInput) => {
      try {
        if (formItem) {
          await updateInspectionType(formItem.id, input);
          addToast('点検種別を更新しました', 'success');
        } else {
          await addInspectionType(input);
          addToast('点検種別を追加しました', 'success');
        }
      } catch (err) {
        console.error('Failed to save inspection type:', err);
        addToast('保存に失敗しました', 'error');
        throw err;
      }
      void reload();
    },
    [formItem, addToast, reload],
  );

  // 使用中の点検種別は消させない（エントリーの inspection_type は点検種別名で持つ）
  // v1: js/admin-masters.js deleteMasterInspectionAction
  const handleRequestDelete = useCallback(
    async (item: InspectionTypeRecord) => {
      try {
        const used = await countEntriesByInspectionName(item.inspection_name);
        if (used > 0) {
          addToast(`この点検種別は${used}件のエントリで使用中です`, 'error');
          return;
        }
      } catch (err) {
        console.error('Failed to check inspection type usage:', err);
        addToast('削除に失敗しました', 'error');
        return;
      }
      setDeleteTarget(item);
    },
    [addToast],
  );

  const handleDelete = useCallback(async () => {
    if (!deleteTarget) return;
    try {
      await deleteItem(deleteTarget.id);
      addToast('点検種別を削除しました', 'success');
    } catch (err) {
      console.error('Failed to delete inspection type:', err);
      addToast('削除に失敗しました', 'error');
    } finally {
      setDeleteTarget(null);
    }
  }, [deleteTarget, deleteItem, addToast]);

  // ドラッグ&ドロップで並べ替え（検索中は無効）
  // v1: js/admin-masters.js handleInspectionDrop / updateInspectionSortOrders
  const handleDrop = useCallback(
    async (targetId: string) => {
      const dragged = draggedId;
      setDraggedId(null);
      setOverId(null);
      if (!dragged || dragged === targetId) return;
      const ordered = moveItem(
        items.map((i) => i.id),
        dragged,
        targetId,
      );
      setReordering(true);
      try {
        for (const u of sortOrderUpdates(ordered, items)) {
          await updateInspectionSortOrder(u.id, u.sort_order);
        }
        addToast('並び順を更新しました', 'success');
      } catch (err) {
        console.error('Sort order update failed:', err);
        addToast('並び順の更新に失敗しました', 'error');
      } finally {
        await reload();
        setReordering(false);
      }
    },
    [draggedId, items, addToast, reload],
  );

  // v1 は getAllMasterData（カテゴリ・テンプレート画像を含む）を読み終えてから一覧を描く
  // v1: js/admin.js loadAllData
  if (loading || optionsLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Spinner size="lg" />
      </div>
    );
  }

  const draggable = !search && !reordering;

  return (
    <div className="space-y-3">
      <MasterToolbar
        count={filteredItems.length}
        search={
          <Input
            placeholder="点検種別名で検索..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        }
        note={
          <>
            テンプレート画像は業務システムの設定で編集します（
            <a
              href={BIZ_TEMPLATE_SETTINGS_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="text-blue-600 underline"
            >
              設定を開く
            </a>
            ）。{draggable && '行をドラッグすると並び順を変えられます'}
          </>
        }
        action={<Button onClick={() => setFormItem(null)}>+ 新規追加</Button>}
      />

      {error && <p className="text-sm text-red-600">{error}</p>}

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-200 text-left">
              {draggable && <th className="cell-head w-8" />}
              <th className="cell-head font-medium text-gray-700">点検種別名</th>
              <th className="cell-head font-medium text-gray-700 w-32">カテゴリ</th>
              <th className="cell-head font-medium text-gray-700">画像</th>
              <th className="cell-head font-medium text-gray-700 w-32">操作</th>
            </tr>
          </thead>
          <tbody>
            {filteredItems.length === 0 ? (
              <tr>
                <td colSpan={draggable ? 5 : 4} className="py-8 text-center text-gray-400">
                  {search ? '検索結果がありません' : '点検種別が登録されていません'}
                </td>
              </tr>
            ) : (
              filteredItems.map((item) => (
                <tr
                  key={item.id}
                  draggable={draggable}
                  onDragStart={(e) => {
                    e.dataTransfer.effectAllowed = 'move';
                    setDraggedId(item.id);
                  }}
                  onDragEnd={() => {
                    setDraggedId(null);
                    setOverId(null);
                  }}
                  onDragOver={(e) => {
                    if (!draggable || !draggedId) return;
                    e.preventDefault();
                    e.dataTransfer.dropEffect = 'move';
                    if (overId !== item.id) setOverId(item.id);
                  }}
                  onDrop={(e) => {
                    e.preventDefault();
                    void handleDrop(item.id);
                  }}
                  className={cn(
                    'border-b border-gray-100 hover:bg-gray-50',
                    draggedId === item.id && 'opacity-50',
                    overId === item.id && draggedId !== item.id && 'bg-blue-50',
                  )}
                >
                  {draggable && <td className="cell text-gray-400 cursor-move select-none">☰</td>}
                  <td className="cell">{item.inspection_name}</td>
                  <td className="cell whitespace-nowrap">
                    {item.category ? (
                      <span className="rounded-full bg-indigo-100 px-2.5 py-0.5 text-xs font-semibold text-indigo-800">
                        {item.category}
                      </span>
                    ) : (
                      '-'
                    )}
                  </td>
                  <td className="cell">{templateLabel(item.template_no)}</td>
                  <td className="cell">
                    <div className="-my-0.5 flex gap-1">
                      <Button variant="ghost" size="sm" onClick={() => setFormItem(item)}>
                        編集
                      </Button>
                      <Button variant="danger" size="sm" onClick={() => void handleRequestDelete(item)}>
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

      {formItem !== undefined && (
        <InspectionTypeFormModal
          key={formItem?.id ?? 'new'}
          item={formItem}
          categories={categories}
          templateImages={templateImages}
          onClose={() => setFormItem(undefined)}
          onSubmit={handleSubmit}
        />
      )}

      <MasterDeleteConfirm
        open={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={handleDelete}
        displayName="点検種別"
        itemLabel={deleteTarget?.inspection_name}
      />
    </div>
  );
}
