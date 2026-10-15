import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { BuildingIcon, WrenchIcon } from '@/components/ui/icons';
import { Select } from '@/components/ui/Select';
import { Spinner } from '@/components/ui/Spinner';
import { useToast } from '@/components/ui/Toast';
import { fetchMasterVendors } from '@/lib/api/masterData';
import type { DbVendor } from '@/types/database';
import { useRelationships, type RelationshipTab } from '../hooks/useRelationships';
import { BuildingRelations } from './BuildingRelations';
import { InspectionRelations } from './InspectionRelations';

type SubTab = RelationshipTab;

// v1: js/admin-relationships.js initRelationshipsTab / loadRelationships
export function RelationshipsContent() {
  const { addToast } = useToast();
  const [vendors, setVendors] = useState<DbVendor[]>([]);
  // 保守会社とサブタブは ?vendor=&tab= に持つ（再読込やブラウザの「戻る」で選び直さなくて済むように）
  const [searchParams, setSearchParams] = useSearchParams();
  const selectedVendorId = searchParams.get('vendor') ?? '';
  const activeTab: SubTab = searchParams.get('tab') === 'inspections' ? 'inspections' : 'buildings';
  const updateParams = (patch: Record<string, string>) =>
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        for (const [k, v] of Object.entries(patch)) {
          if (v) next.set(k, v);
          else next.delete(k);
        }
        return next;
      },
      { replace: true },
    );
  const setSelectedVendorId = (id: string) => updateParams({ vendor: id });
  const setActiveTab = (tab: SubTab) => updateParams({ tab });

  const {
    activeBuildingVendors,
    properties,
    vendorInspections,
    loading,
    buildingError,
    inspectionError,
    loadAvailableProperties,
    loadAvailableInspectionTypes,
    addBuildingVendors,
    removeBuildingVendor,
    removeBuildingVendors,
    addVendorInspections,
    removeVendorInspection,
    removeVendorInspections,
  } = useRelationships(selectedVendorId || null, activeTab);

  // 保守会社の一覧はこの画面を開くたびに読む（v1 は管理画面の起動時に1回だけ読む。失敗しても画面は出す。v1 は console.error のみ）
  useEffect(() => {
    let cancelled = false;
    fetchMasterVendors()
      .then((list) => {
        if (!cancelled) setVendors(list);
      })
      .catch((err) => console.error('Failed to load vendors:', err));
    return () => {
      cancelled = true;
    };
  }, []);

  // 失敗のたびに新しいエラーオブジェクトが来るので、同じ文言の失敗が続いても毎回出す（v1 は失敗ごとに showToast）
  useEffect(() => {
    if (buildingError) addToast(buildingError.message, 'error');
  }, [buildingError, addToast]);

  useEffect(() => {
    if (inspectionError) addToast(inspectionError.message, 'error');
  }, [inspectionError, addToast]);

  // 保守会社の一覧を読み終える前（?vendor= で開いた直後）でも確認の文言が空にならないように
  const vendorName = vendors.find((v) => v.id === selectedVendorId)?.vendor_name ?? 'この保守会社';

  const tabs: { key: SubTab; label: string; icon: typeof BuildingIcon }[] = [
    { key: 'buildings', label: '物件', icon: BuildingIcon },
    { key: 'inspections', label: '点検種別', icon: WrenchIcon },
  ];

  return (
    <div className="space-y-3">
      <h1 className="text-base font-bold text-gray-900">紐付け管理</h1>

      <div className="max-w-sm">
        <Select
          label="保守会社"
          options={vendors.map((v) => ({ value: v.id, label: v.vendor_name }))}
          placeholder="-- 選択してください --"
          value={selectedVendorId}
          onChange={(e) => setSelectedVendorId(e.target.value)}
        />
      </div>

      {!selectedVendorId ? (
        <p className="py-8 text-center text-sm text-gray-500">保守会社を選択してください</p>
      ) : (
        <>
          <div className="border-b border-gray-200">
            <nav className="flex gap-4">
              {tabs.map((tab) => (
                <button
                  key={tab.key}
                  type="button"
                  onClick={() => setActiveTab(tab.key)}
                  className={
                    activeTab === tab.key
                      ? 'border-b-2 border-blue-600 pb-2 text-sm font-medium text-blue-600'
                      : 'pb-2 text-sm font-medium text-gray-500 hover:text-gray-700'
                  }
                >
                  <span className="inline-flex items-center gap-1.5">
                    <tab.icon size={16} />
                    {tab.label}
                  </span>
                </button>
              ))}
            </nav>
          </div>

          {loading ? (
            <div className="flex justify-center py-8">
              <Spinner />
            </div>
          ) : activeTab === 'buildings' ? (
            // key: 保守会社を切り替えたら選択・検索語を持ち越さない
            <BuildingRelations
              key={selectedVendorId}
              vendorName={vendorName}
              buildingVendors={activeBuildingVendors}
              properties={properties}
              loadAvailableProperties={loadAvailableProperties}
              onAdd={addBuildingVendors}
              onRemove={removeBuildingVendor}
              onRemoveMany={removeBuildingVendors}
            />
          ) : (
            <InspectionRelations
              key={selectedVendorId}
              vendorName={vendorName}
              vendorInspections={vendorInspections}
              loadAvailableInspectionTypes={loadAvailableInspectionTypes}
              onAdd={addVendorInspections}
              onRemove={removeVendorInspection}
              onRemoveMany={removeVendorInspections}
            />
          )}
        </>
      )}
    </div>
  );
}
