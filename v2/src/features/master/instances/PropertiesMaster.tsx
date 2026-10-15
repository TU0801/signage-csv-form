import { useCallback, useState } from 'react';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Spinner } from '@/components/ui/Spinner';
import { useToast } from '@/components/ui/Toast';
import type { MasterConfig } from '../types/masterConfig';
import { matchesSearch } from '../hooks/useMasterCRUD';
import { usePropertyMasterData, type PropertyWithUnits } from '../hooks/usePropertyMasterData';
import { MasterTable } from '../components/MasterTable';
import { MasterToolbar } from '../components/MasterToolbar';
import { PropertyFormModal } from '../components/property/PropertyFormModal';
import { PROPERTY_BIZ_GUIDE, terminalSummary } from '../lib/propertyForm';

const BIZ_PROPERTIES_URL = 'https://system.1984.jp/properties';

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

// 物件の追加・削除とコード・名前・端末の変更は業務システムで行う（2026-10-15）。追加・削除ボタンは案内だけ出す
// v1: js/admin-masters.js renderProperties / js/admin.js editPropertyByCode・deletePropertyByCode
export function PropertiesMaster() {
  const { addToast } = useToast();
  const { properties, vendors, inspectionTypes, unitTypeOptions, loading, error, refetch } =
    usePropertyMasterData();

  const [search, setSearch] = useState('');
  // null = 閉じている、物件 = 編集
  const [formTarget, setFormTarget] = useState<PropertyWithUnits | null>(null);

  const filtered = (properties as PropertyRecord[]).filter((p) => matchesSearch(p, SEARCH_FIELDS, search));

  // 追加・削除は DB を呼ばず案内だけ（v1: js/admin.js addPropertyBtn / deletePropertyByCode）
  const showBizGuide = useCallback(() => addToast(PROPERTY_BIZ_GUIDE, 'info'), [addToast]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Spinner size="lg" />
      </div>
    );
  }

  return (
    <div className="space-y-3">
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
        note={
          <>
            物件の追加・削除と物件コード・物件名・端末の変更は業務システムの物件で行います（
            <a href={BIZ_PROPERTIES_URL} target="_blank" rel="noopener noreferrer" className="text-blue-600 underline">
              物件一覧を開く
            </a>
            ）
          </>
        }
        action={<Button onClick={showBizGuide}>+ 新規追加</Button>}
      />

      <MasterTable
        config={tableConfig}
        items={filtered}
        onEdit={(item) => setFormTarget(item)}
        onDelete={showBizGuide}
        renderCell={(key, _value, item) =>
          key === 'terminals' ? terminalSummary(item.terminals) : undefined
        }
        emptyMessage={search ? '検索結果がありません' : '物件が登録されていません'}
      />

      {formTarget && (
        <PropertyFormModal
          key={formTarget.id}
          property={formTarget}
          vendors={vendors}
          inspectionTypes={inspectionTypes}
          unitTypeOptions={unitTypeOptions}
          onClose={() => setFormTarget(null)}
          onSaved={() => void refetch()}
        />
      )}
    </div>
  );
}
