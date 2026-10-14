import { useCallback, useState } from 'react';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Spinner } from '@/components/ui/Spinner';
import { useToast } from '@/components/ui/Toast';
import { countEntriesByPropertyCode, deleteProperty } from '@/lib/api/admin-masters';
import type { MasterConfig } from '../types/masterConfig';
import { matchesSearch } from '../hooks/useMasterCRUD';
import { usePropertyMasterData, type PropertyWithUnits } from '../hooks/usePropertyMasterData';
import { MasterTable } from '../components/MasterTable';
import { MasterToolbar } from '../components/MasterToolbar';
import { MasterDeleteConfirm } from '../components/MasterDeleteConfirm';
import { PropertyFormModal } from '../components/property/PropertyFormModal';
import { terminalSummary } from '../lib/propertyForm';

type PropertyRecord = PropertyWithUnits & Record<string, unknown>;

/** 一覧の列（表示だけ。読み書きは usePropertyMasterData と lib/api/admin-masters） */
const tableConfig: Pick<MasterConfig<PropertyRecord>, 'columns' | 'readOnly'> = {
  columns: [
    { key: 'property_code', label: '物件コード', width: '140px' },
    { key: 'property_name', label: '物件名' },
    { key: 'terminals', label: '端末' },
  ],
};

// 検索は物件コードと物件名（v1 renderProperties）
const SEARCH_FIELDS: (keyof PropertyRecord & string)[] = ['property_code', 'property_name'];

// v1: js/admin-masters.js renderProperties / js/admin.js editPropertyByCode・deletePropertyByCode
export function PropertiesMaster() {
  const { addToast } = useToast();
  const { properties, vendors, inspectionTypes, unitTypeOptions, loading, error, refetch } =
    usePropertyMasterData();

  const [search, setSearch] = useState('');
  // undefined = 閉じている、null = 追加、物件 = 編集
  const [formTarget, setFormTarget] = useState<PropertyWithUnits | null | undefined>(undefined);
  const [deleteTarget, setDeleteTarget] = useState<PropertyWithUnits | null>(null);

  const filtered = (properties as PropertyRecord[]).filter((p) => matchesSearch(p, SEARCH_FIELDS, search));

  // 使用中の物件は消させない
  // v1: js/admin.js deletePropertyByCode
  const handleRequestDelete = useCallback(
    async (item: PropertyWithUnits) => {
      try {
        const used = await countEntriesByPropertyCode(item.property_code);
        if (used > 0) {
          addToast(`この物件は${used}件のエントリで使用中です`, 'error');
          return;
        }
      } catch (err) {
        console.error('Failed to check property usage:', err);
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
      await deleteProperty(deleteTarget.id);
      addToast('物件を削除しました', 'success');
      void refetch();
    } catch (err) {
      console.error('Failed to delete property:', err);
      addToast('削除に失敗しました', 'error');
    } finally {
      setDeleteTarget(null);
    }
  }, [deleteTarget, addToast, refetch]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Spinner size="lg" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {error && <p className="text-sm text-red-600">{error}</p>}
      <MasterToolbar
        count={filtered.length}
        search={
          <Input
            placeholder="物件コード・物件名で検索..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        }
        action={<Button onClick={() => setFormTarget(null)}>+ 新規追加</Button>}
      />

      <MasterTable
        config={tableConfig}
        items={filtered}
        onEdit={(item) => setFormTarget(item)}
        onDelete={(item) => void handleRequestDelete(item)}
        renderCell={(key, _value, item) =>
          key === 'terminals' ? terminalSummary(item.terminals) : undefined
        }
        emptyMessage={search ? '検索結果がありません' : '物件が登録されていません'}
      />

      {formTarget !== undefined && (
        <PropertyFormModal
          key={formTarget?.id ?? 'new'}
          property={formTarget}
          vendors={vendors}
          inspectionTypes={inspectionTypes}
          unitTypeOptions={unitTypeOptions}
          onClose={() => setFormTarget(undefined)}
          onSaved={() => void refetch()}
        />
      )}

      <MasterDeleteConfirm
        open={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={handleDelete}
        displayName="物件"
        itemLabel={deleteTarget ? deleteTarget.property_name : undefined}
      />
    </div>
  );
}
