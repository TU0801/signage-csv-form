import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { cn } from '@/lib/utils';
import { PropertiesMaster } from '@/features/master/instances/PropertiesMaster';
import { VendorsMaster } from '@/features/master/instances/VendorsMaster';
import { InspectionTypesMaster } from '@/features/master/instances/InspectionTypesMaster';
import { CategoriesMaster } from '@/features/master/instances/CategoriesMaster';
import { SettingsContent } from '@/features/settings/components/SettingsContent';

// v1: admin.html #tab-master の data-master（物件・保守会社・点検種別・カテゴリ・設定）
// テンプレート画像（v1.34.0 で業務システムへ移管）と設備管理（signage_building_equipment は廃止表）のタブは無い
const tabs = [
  { key: 'properties', label: '物件', component: PropertiesMaster },
  { key: 'vendors', label: '保守会社', component: VendorsMaster },
  { key: 'inspectionTypes', label: '点検種別', component: InspectionTypesMaster },
  { key: 'categories', label: 'カテゴリ', component: CategoriesMaster },
  { key: 'settings', label: '設定', component: SettingsContent },
] as const;

type TabKey = (typeof tabs)[number]['key'];

export function MasterPage() {
  // /admin/settings からは ?tab=settings で来る（旧 v2 の設定ページの URL を残す）
  const [searchParams] = useSearchParams();
  const requested = searchParams.get('tab');
  const [activeTab, setActiveTab] = useState<TabKey>(
    tabs.find((t) => t.key === requested)?.key ?? 'properties',
  );

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
