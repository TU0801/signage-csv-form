import { useEffect, useState } from 'react';
import { cn } from '@/lib/utils';
import { useAdminCountsStore } from '@/stores/adminCountsStore';
import { countPendingEntries } from '@/lib/api/admin-entries';
import { countPendingBuildingRequests } from '@/lib/api/relationships';
import { PendingEntriesList } from '@/features/approval/components/PendingEntriesList';
import { BuildingRequestsList } from '@/features/approval/components/BuildingRequestsList';

type ApprovalTab = 'data' | 'buildings';

const TABS: { key: ApprovalTab; label: string }[] = [
  { key: 'data', label: 'データ承認' },
  { key: 'buildings', label: 'ビル追加' },
];

/** 承認待ち（データ承認 / ビル追加のサブタブ） */
// v1: admin.html .admin-tab[data-approval-type] / js/admin.js 承認待ちサブタブ切り替え
export function ApprovalPage() {
  // サイドバーの「承認待ち」はデータとビル追加の合計なので、タブごとの件数も出す
  const counts: Record<ApprovalTab, number> = {
    data: useAdminCountsStore((s) => s.pendingEntries),
    buildings: useAdminCountsStore((s) => s.buildingRequests),
  };
  const [tab, setTab] = useState<ApprovalTab | null>(null);
  // 開くタブは両方の件数がそろってから一度だけ決める（データが0件でビル追加があればビル追加）。
  // ストアの件数は届く順がまちまちで、片方だけ見て決めるとデータ待ちがあってもビル追加を開いてしまう。
  // 一度決めたら件数が変わっても動かさない（承認して0件になっても勝手に切り替えない）
  useEffect(() => {
    let cancelled = false;
    Promise.allSettled([countPendingEntries(), countPendingBuildingRequests()]).then(([data, buildings]) => {
      if (cancelled) return;
      const onlyBuildings =
        data.status === 'fulfilled' && data.value === 0 && buildings.status === 'fulfilled' && buildings.value > 0;
      // 先に利用者がタブを押していればそちらを優先する
      setTab((prev) => prev ?? (onlyBuildings ? 'buildings' : 'data'));
    });
    return () => {
      cancelled = true;
    };
  }, []);
  const current = tab ?? 'data';
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
      {current === 'data' ? <PendingEntriesList /> : <BuildingRequestsList />}
    </div>
  );
}
