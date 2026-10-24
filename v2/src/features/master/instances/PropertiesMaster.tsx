import { useMemo, useState } from 'react';
import { Combobox } from '@/components/ui/Combobox';
import { Input } from '@/components/ui/Input';
import { Spinner } from '@/components/ui/Spinner';
import type { MasterConfig } from '../types/masterConfig';
import { matchesSearch, useRememberedSearch } from '../hooks/useMasterCRUD';
import { usePropertyMasterData, type PropertyWithUnits } from '../hooks/usePropertyMasterData';
import { MasterTable } from '../components/MasterTable';
import { MasterToolbar } from '../components/MasterToolbar';
import { PropertyFormModal } from '../components/property/PropertyFormModal';
import { propertyListSummary, terminalSummary, vendorSummary } from '../lib/propertyForm';
import { vendorOptions } from '@/lib/vendorOptions';
import { useAuthStore } from '@/stores/authStore';

const BIZ_PROPERTIES_URL = 'https://system.1984.jp/properties';

type PropertyRecord = PropertyWithUnits & Record<string, unknown>;

/** 一覧の列（表示だけ。読み書きは usePropertyMasterData と lib/api/admin-masters） */
const tableConfig: Pick<MasterConfig<PropertyRecord>, 'columns' | 'readOnly'> = {
  columns: [
    { key: 'property_code', label: '物件コード', width: '140px' },
    { key: 'property_name', label: '物件名' },
    { key: 'terminals', label: '端末' },
    // 以下は一覧で読み込み済みの点検情報・台から出す（設備未登録や担当の保守会社を、開かずに見分けるため）
    { key: 'equipment_count', label: '設備', width: '64px' },
    { key: 'unit_count', label: '台', width: '56px' },
    { key: 'vendor_summary', label: '保守会社' },
  ],
};

// 検索は物件コードと物件名（v1 renderProperties）
const SEARCH_FIELDS: (keyof PropertyRecord & string)[] = ['property_code', 'property_name'];

// 物件の追加・削除とコード・名前・端末の変更は業務システムで行う（2026-10-15）。
// 押しても案内が出るだけの「削除」は各行に出さず、追加は業務システムの物件一覧へのリンクにする
// v1: js/admin-masters.js renderProperties / js/admin.js editPropertyByCode
export function PropertiesMaster() {
  const { properties, vendors, inspectionTypes, unitTypeOptions, loading, error, refetch } =
    usePropertyMasterData();
  // 管理会社: 自社が管理する物件だけ（RLS が絞る）。物件の追加は業務システムで管理者が行うので、追加のリンクを出さない
  const isManagement = useAuthStore((s) => s.profile?.role === 'management');

  const [search, setSearch] = useRememberedSearch('properties');
  // 保守会社での絞り込み（'' はすべて）と、設備情報が未登録の物件だけを出す絞り込み
  const [vendorFilter, setVendorFilter] = useState('');
  const [onlyNoEquipment, setOnlyNoEquipment] = useState(false);
  // null = 閉じている、物件 = 編集
  const [formTarget, setFormTarget] = useState<PropertyWithUnits | null>(null);

  const vendorNames = useMemo(() => new Map(vendors.map((v) => [v.id, v.vendor_name])), [vendors]);
  const summaries = useMemo(
    () => new Map(properties.map((p) => [p.id, propertyListSummary(p, unitTypeOptions)])),
    [properties, unitTypeOptions],
  );

  const filtered = (properties as PropertyRecord[]).filter((p) => {
    const sum = summaries.get(p.id);
    if (onlyNoEquipment && sum && sum.equipmentCount > 0) return false;
    if (vendorFilter && !sum?.vendorIds.includes(vendorFilter)) return false;
    return matchesSearch(p, SEARCH_FIELDS, search);
  });
  const filtering = !!search || !!vendorFilter || onlyNoEquipment;

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
        filters={
          <>
            <div className="w-56">
              <Combobox
                aria-label="保守会社で絞り込み"
                value={vendorFilter}
                options={[
                  { value: '', label: 'すべての保守会社' },
                  ...vendorOptions(vendors),
                ]}
                onChange={setVendorFilter}
                placeholder="すべての保守会社"
              />
            </div>
            <label className="flex items-center gap-1.5 whitespace-nowrap text-sm text-gray-700">
              <input
                type="checkbox"
                className="rounded border-gray-300"
                checked={onlyNoEquipment}
                onChange={(e) => setOnlyNoEquipment(e.target.checked)}
              />
              設備情報が未登録の物件だけ
            </label>
          </>
        }
        note={
          <>
            {isManagement && '自社が管理する物件だけを表示します。編集できるのは設備情報（点検）と台ごとの保守です。'}
            物件の追加・削除と物件コード・物件名・端末の変更は業務システムの物件で行います（
            <a href={BIZ_PROPERTIES_URL} target="_blank" rel="noopener noreferrer" className="text-blue-600 underline">
              物件一覧を開く
            </a>
            ）
          </>
        }
        action={
          // 物件の追加は業務システムで行う（方針は 2026-10-15 のまま。ここでは物件一覧を新しいタブで開くだけ）
          isManagement ? undefined : (
            <a
              href={BIZ_PROPERTIES_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center whitespace-nowrap rounded-md border border-blue-600 px-3 py-1.5 text-sm font-medium text-blue-600 hover:bg-blue-50"
            >
              業務システムで追加<span aria-hidden="true">&nbsp;↗</span>
            </a>
          )
        }
      />

      <MasterTable
        config={tableConfig}
        items={filtered}
        onEdit={(item) => setFormTarget(item)}
        renderCell={(key, _value, item) => {
          const sum = summaries.get(item.id);
          switch (key) {
            case 'terminals':
              return terminalSummary(item.terminals);
            case 'equipment_count':
              return sum && sum.equipmentCount > 0 ? `${sum.equipmentCount}件` : <span className="text-amber-700">未登録</span>;
            case 'unit_count':
              return sum && sum.unitCount > 0 ? `${sum.unitCount}台` : '-';
            case 'vendor_summary': {
              const names = (sum?.vendorIds ?? []).map((id) => vendorNames.get(id) ?? '（不明な保守会社）');
              return (
                <div className="max-w-[20rem] truncate" title={names.join('、') || undefined}>
                  {vendorSummary(names)}
                </div>
              );
            }
            default:
              return undefined;
          }
        }}
        emptyMessage={filtering ? '検索結果がありません' : '物件が登録されていません'}
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
