import { useEffect, useState } from 'react';
import { cn } from '@/lib/utils';
import { useAdminCountsStore } from '@/stores/adminCountsStore';
import { useAuthStore } from '@/stores/authStore';
import { countPendingEntries } from '@/lib/api/admin-entries';
import { countPendingBuildingRequests } from '@/lib/api/relationships';
import { countPendingPropertyRequests } from '@/lib/api/property-requests';
import { countCustomImageEntries } from '@/lib/api/custom-images';
import { PendingEntriesList } from '@/features/approval/components/PendingEntriesList';
import { BuildingRequestsList } from '@/features/approval/components/BuildingRequestsList';
import { PropertyRequestsList } from '@/features/approval/components/PropertyRequestsList';
import { CustomImagesList } from '@/features/approval/components/CustomImagesList';

type ApprovalTab = 'data' | 'buildings' | 'images';

const TABS: { key: ApprovalTab; label: string }[] = [
  { key: 'data', label: 'データ承認' },
  { key: 'buildings', label: 'ビル追加' },
  { key: 'images', label: '追加登録された画像' },
];

/** 承認待ち（データ承認 / ビル追加 / 追加登録された画像のサブタブ） */
// v1: admin.html .admin-tab[data-approval-type] / js/admin.js 承認待ちサブタブ切り替え
export function ApprovalPage() {
  // サイドバーの「承認待ち」はデータとビル追加（紐付け申請＋新規建物の申請）の合計なので、タブごとの件数も出す。
  // 追加登録された画像は状態を問わない一覧（承認待ちの件数には足さない）なので、件数はこの画面だけで持つ
  const [imageCount, setImageCount] = useState(0);
  const buildingRequests = useAdminCountsStore((s) => s.buildingRequests);
  const propertyRequests = useAdminCountsStore((s) => s.propertyRequests);
  const counts: Record<ApprovalTab, number> = {
    data: useAdminCountsStore((s) => s.pendingEntries),
    buildings: buildingRequests + propertyRequests,
    images: imageCount,
  };
  const [tab, setTab] = useState<ApprovalTab | null>(null);
  // 開くタブは両方の件数がそろってから一度だけ決める（データが0件でビル追加があればビル追加）。
  // ストアの件数は届く順がまちまちで、片方だけ見て決めるとデータ待ちがあってもビル追加を開いてしまう。
  // 一度決めたら件数が変わっても動かさない（承認して0件になっても勝手に切り替えない）
  useEffect(() => {
    let cancelled = false;
    Promise.allSettled([
      countPendingEntries(),
      countPendingBuildingRequests(),
      countPendingPropertyRequests(),
    ]).then(([data, buildings, properties]) => {
      if (cancelled) return;
      if (properties.status === 'fulfilled')
        useAdminCountsStore.getState().setPropertyRequests(properties.value);
      const buildingCount =
        (buildings.status === 'fulfilled' ? buildings.value : 0) +
        (properties.status === 'fulfilled' ? properties.value : 0);
      const onlyBuildings = data.status === 'fulfilled' && data.value === 0 && buildingCount > 0;
      // 先に利用者がタブを押していればそちらを優先する
      setTab((prev) => prev ?? (onlyBuildings ? 'buildings' : 'data'));
    });
    countCustomImageEntries().then(
      (n) => {
        if (!cancelled) setImageCount(n);
      },
      (err) => console.error('Failed to count custom images:', err),
    );
    return () => {
      cancelled = true;
    };
  }, []);
  const current = tab ?? 'data';
  const isAdmin = useAuthStore((s) => s.profile?.role === 'admin');
  const isManagement = useAuthStore((s) => s.profile?.role === 'management');
  return (
    <div className="space-y-3">
      <h1 className="text-base font-bold text-gray-900">承認待ち</h1>
      <div className="flex gap-2 border-b border-gray-200">
        {TABS.map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => setTab(t.key)}
            className={cn(
              '-mb-px border-b-2 px-4 py-1.5 text-sm font-medium',
              current === t.key
                ? 'border-blue-600 text-blue-700'
                : 'border-transparent text-gray-500 hover:text-gray-700',
            )}
          >
            {t.label} ({counts[t.key]})
          </button>
        ))}
      </div>
      {current === 'data' && <PendingEntriesList />}
      {current === 'buildings' && (
        <div className="space-y-3">
          <BuildingRequestsList />
          {/* 新規建物の申請: 承認は管理者だけ（業務システムに物件を作るため）。管理会社は自社分の審査（任意。修正依頼1025 D4） */}
          {(isAdmin || isManagement) && <PropertyRequestsList />}
        </div>
      )}
      {/* 使われていない画像の整理（Storage の削除）は管理者だけ */}
      {current === 'images' && <CustomImagesList onCount={setImageCount} canCleanup={isAdmin} />}
    </div>
  );
}
