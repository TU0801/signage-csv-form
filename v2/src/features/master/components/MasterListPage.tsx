import { useState, useCallback } from 'react';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Spinner } from '@/components/ui/Spinner';
import { useToast } from '@/components/ui/Toast';
import { useMasterCRUD } from '../hooks/useMasterCRUD';
import { MasterTable } from './MasterTable';
import { MasterFormModal } from './MasterFormModal';
import { MasterDeleteConfirm } from './MasterDeleteConfirm';
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
  const { filteredItems, loading, search, setSearch, addItem, updateItem, deleteItem } =
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

  const handleFormSubmit = useCallback(
    async (data: Partial<T>) => {
      try {
        if (editItem) {
          await updateItem(editItem['id'] as string, data);
          addToast(`${config.displayName}を更新しました`, 'success');
        } else {
          await addItem(data);
          addToast(`${config.displayName}を追加しました`, 'success');
        }
      } catch (err) {
        addToast(err instanceof Error ? err.message : '保存に失敗しました', 'error');
        throw err;
      }
    },
    [editItem, updateItem, addItem, addToast, config.displayName],
  );

  const handleDelete = useCallback(async () => {
    if (!deleteTarget) return;
    try {
      await deleteItem(deleteTarget['id'] as string);
      addToast(`${config.displayName}を削除しました`, 'success');
    } catch (err) {
      addToast(err instanceof Error ? err.message : '削除に失敗しました', 'error');
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
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <div className="flex-1">
          <Input
            placeholder={`${config.displayName}を検索...`}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <Button onClick={handleAdd}>追加</Button>
      </div>

      <MasterTable
        config={config}
        items={filteredItems}
        onEdit={handleEdit}
        onDelete={setDeleteTarget}
        renderCell={renderCell}
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
        itemLabel={
          deleteTarget ? (deleteTarget[config.searchField] as string) : undefined
        }
      />
    </div>
  );
}
