import { useState } from 'react';
import { cn } from '@/lib/utils';
import { PropertiesMaster } from '@/features/master/instances/PropertiesMaster';
import { VendorsMaster } from '@/features/master/instances/VendorsMaster';
import { InspectionTypesMaster } from '@/features/master/instances/InspectionTypesMaster';
import { CategoriesMaster } from '@/features/master/instances/CategoriesMaster';
import { TemplateImagesMaster } from '@/features/master/instances/TemplateImagesMaster';
import { EquipmentPanel } from '@/features/equipment';

const tabs = [
  { key: 'properties', label: '物件', component: PropertiesMaster },
  { key: 'vendors', label: '保守会社', component: VendorsMaster },
  { key: 'inspectionTypes', label: '点検種別', component: InspectionTypesMaster },
  { key: 'categories', label: 'カテゴリ', component: CategoriesMaster },
  { key: 'templateImages', label: 'テンプレート画像', component: TemplateImagesMaster },
  { key: 'equipment', label: '設備管理', component: EquipmentPanel },
] as const;

type TabKey = (typeof tabs)[number]['key'];

export function MasterPage() {
  const [activeTab, setActiveTab] = useState<TabKey>('properties');

  const ActiveComponent = tabs.find((t) => t.key === activeTab)?.component ?? PropertiesMaster;

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold text-gray-900">マスター管理</h1>

      <div className="border-b border-gray-200">
        <nav className="flex -mb-px gap-4">
          {tabs.map((tab) => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={cn(
                'px-1 py-3 text-sm font-medium border-b-2 transition-colors',
                activeTab === tab.key
                  ? 'border-blue-500 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300',
              )}
            >
              {tab.label}
            </button>
          ))}
        </nav>
      </div>

      <ActiveComponent />
    </div>
  );
}
