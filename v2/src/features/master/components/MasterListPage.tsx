import { useState, useCallback } from 'react';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Spinner } from '@/components/ui/Spinner';
import { useToast } from '@/components/ui/Toast';
import { useMasterCRUD } from '../hooks/useMasterCRUD';
import { MasterTable } from './MasterTable';
import { MasterFormModal } from './MasterFormModal';
import { MasterDeleteConfirm } from './MasterDeleteConfirm';
import { MasterToolbar } from './MasterToolbar';
import type { MasterConfig, FormFieldDef } from '../types/masterConfig';
import type { useForm } from 'react-hook-form';

interface MasterListPageProps<T extends Record<string, unknown>> {
  config: MasterConfig<T>;
  renderCell?: (key: string, value: unknown, item: T) => React.ReactNode;
  renderCustomField?: (field: FormFieldDef, form: ReturnType<typeof useForm>) => React.ReactNode;
}

export function MasterListPage<T extends Record<string, unknown>>({
  config,
  renderCell,
  renderCustomField,
}: MasterListPageProps<T>) {
  const { addToast } = useToast();
  const { filteredItems, loading, error, search, setSearch, addItem, updateItem, deleteItem } =
    useMasterCRUD(config);

  const [formOpen, setFormOpen] = useState(false);
  const [editItem, setEditItem] = useState<T | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<T | null>(null);

  const handleAdd = useCallback(() => {
    setEditItem(null);
    setFormOpen(true);
  }, []);

  const handleEdit = useCallback((item: T) => {
    setEditItem(item);
    setFormOpen(true);
  }, []);

  // v1: js/admin-masters.js handleMasterFormSubmit（成功は「〜を追加/更新しました」、失敗は「保存に失敗しました」）
  const handleFormSubmit = useCallback(
    async (formData: Partial<T>) => {
      const data = config.toPayload ? config.toPayload(formData) : formData;
      try {
        if (editItem) {
          await updateItem(editItem['id'] as string, data);
          addToast(`${config.displayName}を更新しました`, 'success');
        } else {
          await addItem(data);
          addToast(`${config.displayName}を追加しました`, 'success');
        }
      } catch (err) {
        console.error(`Failed to save ${config.displayName}:`, err);
        addToast('保存に失敗しました', 'error');
        throw err;
      }
    },
    [editItem, updateItem, addItem, addToast, config],
  );

  // v1: js/admin-masters.js deleteMaster*Action（使用中なら確認を出さずにエラー）
  const handleRequestDelete = useCallback(
    async (item: T) => {
      if (config.beforeDelete) {
        try {
          const reason = await config.beforeDelete(item);
          if (reason) {
            addToast(reason, 'error');
            return;
          }
        } catch (err) {
          console.error(`Failed to check ${config.displayName} usage:`, err);
          addToast('削除に失敗しました', 'error');
          return;
        }
      }
      setDeleteTarget(item);
    },
    [config, addToast],
  );

  const handleDelete = useCallback(async () => {
    if (!deleteTarget) return;
    try {
      await deleteItem(deleteTarget['id'] as string);
      addToast(`${config.displayName}を削除しました`, 'success');
    } catch (err) {
      console.error(`Failed to delete ${config.displayName}:`, err);
      addToast('削除に失敗しました', 'error');
    } finally {
      setDeleteTarget(null);
    }
  }, [deleteTarget, deleteItem, addToast, config.displayName]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Spinner size="lg" />
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <MasterToolbar
        count={filteredItems.length}
        search={
          <Input
            placeholder={config.searchPlaceholder ?? `${config.displayName}を検索...`}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        }
        note={config.note}
        action={!config.readOnly && <Button onClick={handleAdd}>+ 新規追加</Button>}
      />

      {error && <p className="text-sm text-red-600">{error}</p>}

      <MasterTable
        config={config}
        items={filteredItems}
        onEdit={handleEdit}
        onDelete={(item) => void handleRequestDelete(item)}
        renderCell={renderCell}
        emptyMessage={search ? '検索結果がありません' : `${config.displayName}が登録されていません`}
      />

      <MasterFormModal
        open={formOpen}
        onClose={() => setFormOpen(false)}
        onSubmit={handleFormSubmit}
        config={config}
        editItem={editItem}
        renderCustomField={renderCustomField}
      />

      <MasterDeleteConfirm
        open={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={handleDelete}
        displayName={config.displayName}
        itemLabel={deleteTarget ? String(deleteTarget[config.labelField] ?? '') : undefined}
      />
    </div>
  );
}
