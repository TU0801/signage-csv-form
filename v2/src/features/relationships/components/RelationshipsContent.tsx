import { useState } from 'react';
import { Select } from '@/components/ui/Select';
import { Spinner } from '@/components/ui/Spinner';
import { useMasterData } from '@/hooks/useMasterData';
import { useRelationships } from '../hooks/useRelationships';
import { BuildingRelations } from './BuildingRelations';
import { InspectionRelations } from './InspectionRelations';

type SubTab = 'buildings' | 'inspections';

export function RelationshipsContent() {
  const [selectedVendorId, setSelectedVendorId] = useState('');
  const [activeTab, setActiveTab] = useState<SubTab>('buildings');

  const { vendors, properties, inspectionTypes, loading: masterLoading } = useMasterData();
  const {
    buildingVendors,
    vendorInspections,
    loading: relLoading,
    addBuildingVendor,
    removeBuildingVendor,
    addVendorInspection,
    removeVendorInspection,
    toggleVendorInspectionStatus,
  } = useRelationships(selectedVendorId || null);

  const loading = masterLoading || relLoading;

  const tabs: { key: SubTab; label: string }[] = [
    { key: 'buildings', label: 'ビル紐付け' },
    { key: 'inspections', label: '点検種別紐付け' },
  ];

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-bold text-gray-900">紐付け管理</h1>

      <div className="max-w-sm">
        <Select
          label="保守会社"
          options={vendors.map((v) => ({ value: v.id, label: v.vendor_name }))}
          placeholder="保守会社を選択..."
          value={selectedVendorId}
          onChange={(e) => setSelectedVendorId(e.target.value)}
        />
      </div>

      {selectedVendorId && (
        <>
          <div className="border-b border-gray-200">
            <nav className="flex gap-4">
              {tabs.map((tab) => (
                <button
                  key={tab.key}
                  onClick={() => setActiveTab(tab.key)}
                  className={
                    activeTab === tab.key
                      ? 'border-b-2 border-blue-600 pb-2 text-sm font-medium text-blue-600'
                      : 'pb-2 text-sm font-medium text-gray-500 hover:text-gray-700'
                  }
                >
                  {tab.label}
                </button>
              ))}
            </nav>
          </div>

          {loading ? (
            <div className="flex justify-center py-8">
              <Spinner />
            </div>
          ) : activeTab === 'buildings' ? (
            <BuildingRelations
              buildingVendors={buildingVendors}
              properties={properties}
              onAdd={addBuildingVendor}
              onRemove={removeBuildingVendor}
            />
          ) : (
            <InspectionRelations
              vendorInspections={vendorInspections}
              inspectionTypes={inspectionTypes}
              onAdd={addVendorInspection}
              onRemove={removeVendorInspection}
              onToggleStatus={toggleVendorInspectionStatus}
            />
          )}
        </>
      )}
    </div>
  );
}
