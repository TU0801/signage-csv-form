import { useEffect, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { cn } from '@/lib/utils';
import { countApprovedEntries, countPendingEntries } from '@/lib/api/admin-entries';
import { countPendingBuildingRequests } from '@/lib/api/relationships';
import { currentEntriesFilters } from '@/features/entries-list/hooks/useEntriesFilters';
import { useAdminCountsStore } from '@/stores/adminCountsStore';

type BadgeKey = 'pending' | 'approved';

// v1: admin.html .sidebar-nav（並び・名前を合わせる。「設定」は v1 と同じくマスター管理のタブ）
// アイコンは v1 の .sidebar-nav-icon（広告枠管理は v1 でもアイコン無し）。閉じたときはアイコンだけ残る
const adminNav: { to: string; label: string; icon?: string; exact?: boolean; badge?: BadgeKey }[] = [
  { to: '/admin', label: '承認待ち', icon: '⏳', exact: true, badge: 'pending' },
  { to: '/admin/entries', label: '承認済み', icon: '✅', badge: 'approved' },
  { to: '/admin/relationships', label: '紐付け管理', icon: '🔗' },
  { to: '/admin/master', label: 'マスター管理', icon: '📋' },
  { to: '/admin/users', label: 'ユーザー管理', icon: '👥' },
  { to: '/admin/ad-slots', label: '広告枠管理' },
];

// v1: js/admin.js initSidebarToggle（localStorage の 'sidebarCollapsed' に 'true' / 'false' を保存）
export const SIDEBAR_COLLAPSED_KEY = 'sidebarCollapsed';

function readCollapsed(): boolean {
  try {
    return localStorage.getItem(SIDEBAR_COLLAPSED_KEY) === 'true';
  } catch {
    return false;
  }
}

export function AdminSidebar() {
  const location = useLocation();
  const pendingEntries = useAdminCountsStore((s) => s.pendingEntries);
  const buildingRequests = useAdminCountsStore((s) => s.buildingRequests);
  const approved = useAdminCountsStore((s) => s.approved);
  const [collapsed, setCollapsed] = useState(readCollapsed);

  const toggleCollapsed = () => {
    const next = !collapsed;
    setCollapsed(next);
    try {
      localStorage.setItem(SIDEBAR_COLLAPSED_KEY, String(next));
    } catch {
      // 保存できなくても開閉はする
    }
  };

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
    <aside
      className={cn(
        // ヘッダーの下に固定し、画面の残りの高さに合わせる。スクロールは nav に持たせる
        // （aside に overflow を付けると右にはみ出した開閉ボタンが切れる。sticky も absolute の基準になるので relative は不要）
        'sticky top-[var(--header-h)] flex h-[calc(100dvh-var(--header-h))] shrink-0 flex-col self-start bg-gray-50 border-r border-gray-200 transition-[width]',
        collapsed ? 'w-[60px]' : 'w-48',
      )}
    >
      {/* v1: admin.html #sidebarToggle（.sidebar-toggle） */}
      <button
        type="button"
        onClick={toggleCollapsed}
        title="サイドバーを開閉"
        className="absolute top-4 -right-3 z-10 flex h-6 w-6 items-center justify-center rounded-full bg-[#667eea] text-xs text-white hover:bg-[#5a67d8]"
      >
        {collapsed ? '▶' : '◀'}
      </button>
      <nav className={cn('min-h-0 flex-1 space-y-1 overflow-y-auto', collapsed ? 'px-2 py-3' : 'p-3')}>
        {adminNav.map((item) => {
          const count = item.badge ? counts[item.badge] : 0;
          return (
            <Link
              key={item.to}
              to={item.to}
              title={collapsed ? item.label : undefined}
              className={cn(
                'flex items-center rounded-md text-sm font-medium transition-colors',
                collapsed ? 'justify-center px-2 py-3' : 'justify-between px-3 py-2',
                isActive(item)
                  ? 'bg-blue-50 text-blue-700'
                  : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900',
              )}
            >
              <span className="flex items-center gap-2">
                {item.icon && <span aria-hidden="true">{item.icon}</span>}
                {/* 閉じたとき、アイコンの無い項目（広告枠管理）は頭文字を出す（v1 は空になる） */}
                {collapsed ? (!item.icon && <span>{item.label.slice(0, 1)}</span>) : <span>{item.label}</span>}
              </span>
              {!collapsed && count > 0 && (
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
