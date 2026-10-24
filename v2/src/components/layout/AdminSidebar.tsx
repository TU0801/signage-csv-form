import { useEffect, useState, type ComponentType } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { cn } from '@/lib/utils';
import {
  CircleCheckIcon,
  DatabaseIcon,
  InboxIcon,
  LinkIcon,
  MegaphoneIcon,
  PanelLeftCloseIcon,
  PanelLeftOpenIcon,
  UsersIcon,
} from '@/components/ui/icons';
import { countApprovedEntries, countPendingEntries } from '@/lib/api/admin-entries';
import { countPendingBuildingRequests } from '@/lib/api/relationships';
import { currentEntriesFilters } from '@/features/entries-list/hooks/useEntriesFilters';
import { useAdminCountsStore } from '@/stores/adminCountsStore';
import { useAuthStore } from '@/stores/authStore';

type BadgeKey = 'pending' | 'approved';

// v1: admin.html .sidebar-nav（並び・名前を合わせる。「設定」は v1 と同じくマスター管理のタブ）
// アイコンは v1 の絵文字ではなく線のアイコン（ユーザー指定 2026-10-15）。全項目に付け、閉じたときはアイコンだけ残る
const adminNav: {
  to: string;
  label: string;
  icon: ComponentType<{ size?: number; className?: string }>;
  exact?: boolean;
  badge?: BadgeKey;
  /** 管理者だけ（管理会社メニューには出さない） */
  adminOnly?: boolean;
}[] = [
  { to: '/admin', label: '承認待ち', icon: InboxIcon, exact: true, badge: 'pending' },
  { to: '/admin/entries', label: '承認済み', icon: CircleCheckIcon, badge: 'approved' },
  { to: '/admin/relationships', label: '紐付け管理', icon: LinkIcon },
  { to: '/admin/master', label: 'マスター管理', icon: DatabaseIcon },
  { to: '/admin/users', label: 'ユーザー管理', icon: UsersIcon },
  { to: '/admin/ad-slots', label: '広告枠管理', icon: MegaphoneIcon, adminOnly: true },
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
  // 管理会社: 見出し「管理会社メニュー」、広告枠管理は出さない（範囲は自社が管理する物件。DB 側で絞る）
  const isManagement = useAuthStore((s) => s.profile?.role === 'management');
  const navItems = isManagement ? adminNav.filter((item) => !item.adminOnly) : adminNav;
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
        'sticky top-[var(--header-h)] flex h-[calc(100dvh-var(--header-h))] shrink-0 flex-col self-start bg-white border-r border-gray-200 transition-[width]',
        collapsed ? 'w-[60px]' : 'w-48',
      )}
    >
      {/* v1: admin.html #sidebarToggle。ナビの上に置くパネル開閉アイコン */}
      <div className={cn('flex px-2 pt-2', collapsed ? 'justify-center' : 'justify-end')}>
        <button
          type="button"
          onClick={toggleCollapsed}
          title="サイドバーを開閉"
          aria-label={collapsed ? 'サイドバーを開く' : 'サイドバーを閉じる'}
          className="flex h-7 w-7 items-center justify-center rounded-md text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-700"
        >
          {collapsed ? <PanelLeftOpenIcon size={16} /> : <PanelLeftCloseIcon size={16} />}
        </button>
      </div>
      {isManagement && !collapsed && (
        <p className="px-3 pb-1 text-xs font-semibold text-gray-500">管理会社メニュー</p>
      )}
      <nav
        aria-label={isManagement ? '管理会社メニュー' : undefined}
        className="min-h-0 flex-1 space-y-0.5 overflow-y-auto px-2 py-1"
      >
        {navItems.map((item) => {
          const count = item.badge ? counts[item.badge] : 0;
          const active = isActive(item);
          const Icon = item.icon;
          return (
            <Link
              key={item.to}
              to={item.to}
              title={collapsed ? item.label : undefined}
              className={cn(
                'relative flex items-center rounded-md text-sm transition-colors',
                collapsed ? 'justify-center px-2 py-2' : 'justify-between px-2.5 py-1.5',
                active
                  ? 'bg-blue-50 font-semibold text-blue-700'
                  : 'font-medium text-gray-600 hover:bg-gray-100 hover:text-gray-900',
              )}
            >
              {/* 選択中は左端に色の線 */}
              {active && <span aria-hidden="true" className="absolute inset-y-1 left-0 w-0.5 rounded-full bg-blue-600" />}
              <span className="flex items-center gap-2.5">
                <Icon size={18} className={cn('shrink-0', active ? 'text-blue-600' : 'text-gray-400')} />
                {!collapsed && <span>{item.label}</span>}
              </span>
              {!collapsed && count > 0 && (
                <span
                  className={cn(
                    'ml-2 inline-flex min-w-[1.25rem] items-center justify-center rounded-full px-1.5 py-0.5 text-xs font-semibold tabular-nums',
                    item.badge === 'pending' ? 'bg-red-500 text-white' : 'bg-gray-100 text-gray-600',
                  )}
                >
                  {count}
                </span>
              )}
              {/* 閉じたときは件数の代わりに点で知らせる（承認待ちがあるとき） */}
              {collapsed && item.badge === 'pending' && count > 0 && (
                <span aria-hidden="true" className="absolute right-1.5 top-1.5 h-2 w-2 rounded-full bg-red-500" />
              )}
            </Link>
          );
        })}
      </nav>
    </aside>
  );
}
