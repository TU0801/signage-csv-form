import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Button } from '@/components/ui/Button';
import { GripVerticalIcon } from '@/components/ui/icons';
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
import { matchesSearch, useMasterCRUD } from '../hooks/useMasterCRUD';
import { MasterToolbar } from '../components/MasterToolbar';
import { MasterDeleteConfirm } from '../components/MasterDeleteConfirm';
import { InspectionTypeFormModal, type InspectionTypeFlagsInput } from '../components/InspectionTypeFormModal';
import { fetchInspectionTypeFlags, saveInspectionTypeFlags } from '@/lib/api/portal';
import { categoryTabs, moveItem, NO_CATEGORY, sortOrderUpdates, swapItems, templateLabel } from '../lib/inspectionTypes';

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
  const { items, loading, error, search, setSearch, reload, deleteItem } = useMasterCRUD(config, {
    rememberSearchAs: 'inspectionTypes',
  });
  const { categories, templateImages, optionsLoading } = useInspectionTypeOptions();
  // 点検種別の印（申請不要・毎月。修正依頼1025 H4/G4）。読めなければ印なしとして出す（保存のときに失敗を知らせる）
  const [flags, setFlags] = useState<ReadonlyMap<string, InspectionTypeFlagsInput>>(() => new Map());
  const loadFlags = useCallback(async () => {
    try {
      const rows = await fetchInspectionTypeFlags();
      setFlags(new Map(rows.map((r) => [r.inspection_type_id, { report_only: r.report_only, monthly: r.monthly }])));
    } catch (err) {
      console.error('点検種別の印の取得に失敗しました:', err);
    }
  }, []);
  useEffect(() => {
    void loadFlags();
  }, [loadFlags]);

  const [formItem, setFormItem] = useState<DbInspectionType | null | undefined>(undefined);
  const [deleteTarget, setDeleteTarget] = useState<InspectionTypeRecord | null>(null);
  const [draggedId, setDraggedId] = useState<string | null>(null);
  const [overId, setOverId] = useState<string | null>(null);
  const [reordering, setReordering] = useState(false);
  // 並べ替えの保存中は新しい並びを先に表示する（保存は1行ずつなので、終わるまで古い並びのままにしない）
  const [localOrder, setLocalOrder] = useState<string[] | null>(null);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  // null = すべてのカテゴリ
  const [categoryFilter, setCategoryFilter] = useState<string | null>(null);
  // ↑↓で動かした行のボタン。保存後にフォーカスを戻す（キーボードで続けて動かせるように）
  const moveButtons = useRef(new Map<string, HTMLButtonElement>());
  const [refocus, setRefocus] = useState<{ id: string; dir: 'up' | 'down' } | null>(null);

  const orderedItems = useMemo(() => {
    if (!localOrder) return items;
    const index = new Map(localOrder.map((id, i) => [id, i]));
    return [...items].sort((a, b) => (index.get(a.id) ?? 0) - (index.get(b.id) ?? 0));
  }, [items, localOrder]);

  const tabs = useMemo(
    () => categoryTabs(items, categories.map((c) => c.category_name)),
    [items, categories],
  );

  const visibleItems = orderedItems.filter(
    (i) =>
      (categoryFilter === null || (i.category || NO_CATEGORY) === categoryFilter) &&
      matchesSearch(i, config.searchFields, search),
  );

  // v1: js/admin-masters.js handleMasterFormSubmit（type === 'inspection'）
  const handleSubmit = useCallback(
    async (input: InspectionTypeInput, typeFlags: InspectionTypeFlagsInput, flagsChanged: boolean) => {
      let id: string;
      try {
        if (formItem) {
          id = (await updateInspectionType(formItem.id, input)).id;
        } else {
          id = (await addInspectionType(input)).id;
        }
      } catch (err) {
        console.error('Failed to save inspection type:', err);
        addToast('保存に失敗しました', 'error');
        throw err;
      }
      // 印は別の表（signage_inspection_type_flags）。変えたときだけ書く。失敗したら点検種別は保存済みと分かるように知らせて開いたまま
      if (flagsChanged) {
        try {
          await saveInspectionTypeFlags(id, typeFlags);
          void loadFlags();
        } catch (err) {
          console.error('Failed to save inspection type flags:', err);
          addToast('点検種別は保存しましたが、申請不要・毎月の設定を保存できませんでした', 'error');
          void reload();
          throw err;
        }
      }
      addToast(formItem ? '点検種別を更新しました' : '点検種別を追加しました', 'success');
      void reload();
    },
    [formItem, addToast, reload, loadFlags],
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

  // 新しい並びを先に表示してから、sort_order が変わる行だけを1行ずつ保存する
  // v1: js/admin-masters.js updateInspectionSortOrders
  const saveOrder = useCallback(
    async (ordered: string[]) => {
      const updates = sortOrderUpdates(ordered, items);
      if (updates.length === 0) return;
      setLocalOrder(ordered);
      setReordering(true);
      setProgress({ done: 0, total: updates.length });
      try {
        for (const [n, u] of updates.entries()) {
          await updateInspectionSortOrder(u.id, u.sort_order);
          setProgress({ done: n + 1, total: updates.length });
        }
        addToast('並び順を更新しました', 'success');
      } catch (err) {
        console.error('Sort order update failed:', err);
        addToast('並び順の更新に失敗しました', 'error');
      } finally {
        await reload();
        setLocalOrder(null);
        setProgress(null);
        setReordering(false);
      }
    },
    [items, addToast, reload],
  );

  // ドラッグ&ドロップで並べ替え（検索中は無効。カテゴリの絞り込み中は、見えている行どうしで動かせる）
  // v1: js/admin-masters.js handleInspectionDrop
  const handleDrop = useCallback(
    async (targetId: string) => {
      const dragged = draggedId;
      setDraggedId(null);
      setOverId(null);
      if (!dragged || dragged === targetId) return;
      await saveOrder(
        moveItem(
          orderedItems.map((i) => i.id),
          dragged,
          targetId,
        ),
      );
    },
    [draggedId, orderedItems, saveOrder],
  );

  // ↑↓：表示中の1つ上・下の行と入れ替える（170 行の表をドラッグしたままスクロールしなくて済むように）
  const moveBy = (id: string, step: -1 | 1) => {
    if (reordering) return;
    const at = visibleItems.findIndex((i) => i.id === id);
    const neighbor = visibleItems[at + step];
    if (at < 0 || !neighbor) return;
    setRefocus({ id, dir: step < 0 ? 'up' : 'down' });
    void saveOrder(
      swapItems(
        orderedItems.map((i) => i.id),
        id,
        neighbor.id,
      ),
    );
  };

  // 保存が終わったら押したボタンへフォーカスを戻す。端に着いて押せなくなったら反対向きのボタンへ
  useEffect(() => {
    if (!refocus || reordering) return;
    const other = refocus.dir === 'up' ? 'down' : 'up';
    const target = [refocus.dir, other]
      .map((d) => moveButtons.current.get(`${refocus.id}:${d}`))
      .find((b) => b && !b.disabled);
    target?.focus();
    setRefocus(null);
  }, [refocus, reordering]);

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
        count={visibleItems.length}
        search={
          <Input
            placeholder="点検種別名で検索..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        }
        filters={
          <div role="group" aria-label="カテゴリで絞り込み" className="flex flex-wrap gap-1">
            {[{ key: null, label: 'すべて', count: items.length }, ...tabs].map((t) => (
              <button
                key={t.key ?? 'all'}
                type="button"
                aria-pressed={categoryFilter === t.key}
                onClick={() => setCategoryFilter(t.key)}
                className={cn(
                  'rounded-full border px-2.5 py-0.5 text-sm whitespace-nowrap',
                  categoryFilter === t.key
                    ? 'border-blue-600 bg-blue-600 text-white'
                    : 'border-gray-300 bg-white text-gray-700 hover:bg-gray-50',
                )}
              >
                {t.label} {t.count}
              </button>
            ))}
          </div>
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
            ）。
            {progress
              ? `並び順を保存しています（${progress.done}/${progress.total}）…`
              : draggable
                ? '行をドラッグするか ↑↓ を押すと並び順を変えられます'
                : '検索中は並び順を変えられません（カテゴリの絞り込み中は変えられます）'}
          </>
        }
        action={<Button onClick={() => setFormItem(null)}>+ 新規追加</Button>}
      />

      {error && <p className="text-sm text-red-600">{error}</p>}

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-200 text-left">
              {!search && <th className="cell-head w-20" />}
              <th className="cell-head font-medium text-gray-700">点検種別名</th>
              <th className="cell-head font-medium text-gray-700 w-32">カテゴリ</th>
              <th className="cell-head font-medium text-gray-700">画像</th>
              <th className="cell-head font-medium text-gray-700">案内文</th>
              <th className="cell-head font-medium text-gray-700 w-32">操作</th>
            </tr>
          </thead>
          <tbody>
            {visibleItems.length === 0 ? (
              <tr>
                <td colSpan={search ? 5 : 6} className="py-8 text-center text-gray-400">
                  {search || categoryFilter !== null ? '検索結果がありません' : '点検種別が登録されていません'}
                </td>
              </tr>
            ) : (
              visibleItems.map((item, index) => (
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
                  {!search && (
                    <td className="cell text-gray-400 select-none">
                      <div className="-my-0.5 flex items-center gap-0.5">
                        <span className="cursor-move" title="ドラッグで並べ替え">
                          <GripVerticalIcon size={16} />
                        </span>
                        <button
                          type="button"
                          aria-label={`${item.inspection_name}を1つ上へ`}
                          title="1つ上へ"
                          ref={(el) => {
                            if (el) moveButtons.current.set(`${item.id}:up`, el);
                            else moveButtons.current.delete(`${item.id}:up`);
                          }}
                          disabled={index === 0}
                          // 保存中は disabled にしない（押したボタンからフォーカスが外れるため）。押しても moveBy が何もしない
                          aria-disabled={reordering || undefined}
                          onClick={() => moveBy(item.id, -1)}
                          className="rounded px-1 text-gray-500 hover:bg-gray-100 disabled:opacity-30 aria-disabled:opacity-30"
                        >
                          ↑
                        </button>
                        <button
                          type="button"
                          aria-label={`${item.inspection_name}を1つ下へ`}
                          title="1つ下へ"
                          ref={(el) => {
                            if (el) moveButtons.current.set(`${item.id}:down`, el);
                            else moveButtons.current.delete(`${item.id}:down`);
                          }}
                          disabled={index === visibleItems.length - 1}
                          // 保存中は disabled にしない（押したボタンからフォーカスが外れるため）。押しても moveBy が何もしない
                          aria-disabled={reordering || undefined}
                          onClick={() => moveBy(item.id, 1)}
                          className="rounded px-1 text-gray-500 hover:bg-gray-100 disabled:opacity-30 aria-disabled:opacity-30"
                        >
                          ↓
                        </button>
                      </div>
                    </td>
                  )}
                  <td className="cell">
                    {item.inspection_name}
                    {/* 掲示板に出さない種別は、編集を開かなくても分かるようにする */}
                    {item.show_on_board === false && (
                      <span className="ml-1.5 whitespace-nowrap rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-600">
                        掲示板に出さない
                      </span>
                    )}
                  </td>
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
                    {item.default_text ? (
                      <div className="max-w-[24rem] truncate text-gray-600" title={item.default_text}>
                        {item.default_text}
                      </div>
                    ) : (
                      <span className="text-amber-700">未入力</span>
                    )}
                  </td>
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
          flags={formItem ? flags.get(formItem.id) : undefined}
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
