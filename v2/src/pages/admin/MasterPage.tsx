import { useSearchParams } from 'react-router-dom';
import { cn } from '@/lib/utils';
import { useAuthStore } from '@/stores/authStore';
import { PropertiesMaster } from '@/features/master/instances/PropertiesMaster';
import { VendorsMaster } from '@/features/master/instances/VendorsMaster';
import { InspectionTypesMaster } from '@/features/master/instances/InspectionTypesMaster';
import { CategoriesMaster } from '@/features/master/instances/CategoriesMaster';
import { SettingsContent } from '@/features/settings/components/SettingsContent';
import { PosterLibraryMaster } from '@/features/poster-library/components/PosterLibraryMaster';

// v1: admin.html #tab-master の data-master（物件・保守会社・点検種別・カテゴリ・設定）
// テンプレート画像（v1.34.0 で業務システムへ移管）と設備管理（signage_building_equipment は廃止表）のタブは無い
// management: 管理会社にも出すタブ（物件は自社物件の点検情報だけ編集できる。保守会社は元から閲覧のみ）。
// 点検種別・カテゴリ・設定は全社共通のマスターなので管理会社には出さない（修正依頼1024 C2）
const tabs = [
  { key: 'properties', label: '物件', component: PropertiesMaster, management: true },
  { key: 'vendors', label: '保守会社', component: VendorsMaster, management: true },
  { key: 'inspectionTypes', label: '点検種別', component: InspectionTypesMaster, management: false },
  { key: 'categories', label: 'カテゴリ', component: CategoriesMaster, management: false },
  // 文字を合成しない貼紙（修正依頼1025 D2）。管理会社は自社分を登録できる
  { key: 'posterLibrary', label: '貼紙ライブラリ', component: PosterLibraryMaster, management: true },
  { key: 'settings', label: '設定', component: SettingsContent, management: false },
] as const;

type TabKey = (typeof tabs)[number]['key'];

export function MasterPage() {
  const isManagement = useAuthStore((s) => s.profile?.role === 'management');
  const visibleTabs = isManagement ? tabs.filter((t) => t.management) : tabs;
  // 開いているタブは ?tab= に持つ（再読込や他の画面から戻っても同じタブ）。/admin/settings からは ?tab=settings で来る
  const [searchParams, setSearchParams] = useSearchParams();
  const requested = searchParams.get('tab');
  const activeTab: TabKey = visibleTabs.find((t) => t.key === requested)?.key ?? 'properties';
  const setActiveTab = (key: TabKey) =>
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        next.set('tab', key);
        return next;
      },
      { replace: true },
    );

  const ActiveComponent = visibleTabs.find((t) => t.key === activeTab)?.component ?? PropertiesMaster;

  return (
    <div className="space-y-3">
      <h1 className="text-base font-bold text-gray-900">マスター管理</h1>

      <div className="border-b border-gray-200">
        <nav className="flex -mb-px gap-4">
          {visibleTabs.map((tab) => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={cn(
                'px-1 py-2 text-sm font-medium border-b-2 transition-colors',
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
