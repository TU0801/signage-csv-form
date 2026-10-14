import { useEffect } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { cn } from '@/lib/utils';
import { countApprovedEntries, countPendingEntries } from '@/lib/api/admin-entries';
import { countPendingBuildingRequests } from '@/lib/api/relationships';
import { currentEntriesFilters } from '@/features/entries-list/hooks/useEntriesFilters';
import { useAdminCountsStore } from '@/stores/adminCountsStore';

type BadgeKey = 'pending' | 'approved';

// v1: admin.html .sidebar-nav（並び・名前を合わせる。「設定」は v1 と同じくマスター管理のタブ）
const adminNav: { to: string; label: string; exact?: boolean; badge?: BadgeKey }[] = [
  { to: '/admin', label: '承認待ち', exact: true, badge: 'pending' },
  { to: '/admin/entries', label: '承認済み', badge: 'approved' },
  { to: '/admin/relationships', label: '紐付け管理' },
  { to: '/admin/master', label: 'マスター管理' },
  { to: '/admin/users', label: 'ユーザー管理' },
  { to: '/admin/ad-slots', label: '広告枠管理' },
];

export function AdminSidebar() {
  const location = useLocation();
  const pendingEntries = useAdminCountsStore((s) => s.pendingEntries);
  const buildingRequests = useAdminCountsStore((s) => s.buildingRequests);
  const approved = useAdminCountsStore((s) => s.approved);

  // v1: js/admin.js updateSidebarCounts（承認待ち = データ承認 + ビル追加リクエスト、承認済み = データ一覧の件数）
  useEffect(() => {
    let cancelled = false;
    const { setPendingEntries, setBuildingRequests, setApproved } = useAdminCountsStore.getState();
    const settle = <T,>(p: Promise<T>, set: (v: T) => void) =>
      p.then(
        (v) => {
          if (!cancelled) set(v);
        },
        (err) => console.error('Failed to load sidebar counts:', err),
      );
    settle(countPendingEntries(), setPendingEntries);
    settle(countPendingBuildingRequests(), setBuildingRequests);
    settle(countApprovedEntries(currentEntriesFilters()), setApproved);
    return () => {
      cancelled = true;
    };
  }, [location.pathname]);

  const counts: Record<BadgeKey, number> = {
    pending: pendingEntries + buildingRequests,
    approved,
  };

  const isActive = (item: (typeof adminNav)[number]) => {
    if (item.exact) return location.pathname === item.to;
    return location.pathname.startsWith(item.to);
  };

  return (
    <aside className="w-48 bg-gray-50 border-r border-gray-200 min-h-[calc(100vh-3.5rem)]">
      <nav className="p-3 space-y-1">
        {adminNav.map((item) => {
          const count = item.badge ? counts[item.badge] : 0;
          return (
            <Link
              key={item.to}
              to={item.to}
              className={cn(
                'flex items-center justify-between px-3 py-2 rounded-md text-sm font-medium transition-colors',
                isActive(item)
                  ? 'bg-blue-50 text-blue-700'
                  : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900',
              )}
            >
              <span>{item.label}</span>
              {count > 0 && (
                <span
                  className={cn(
                    'ml-2 inline-flex items-center justify-center rounded-full px-2 py-0.5 text-xs font-bold min-w-[1.25rem]',
                    item.badge === 'pending' ? 'bg-red-500 text-white' : 'bg-gray-200 text-gray-700',
                  )}
                >
                  {count}
                </span>
              )}
            </Link>
          );
        })}
      </nav>
    </aside>
  );
}
