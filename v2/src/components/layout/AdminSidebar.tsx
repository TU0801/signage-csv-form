import { Link, useLocation } from 'react-router-dom';
import { cn } from '@/lib/utils';

const adminNav = [
  { to: '/admin', label: '承認', exact: true },
  { to: '/admin/entries', label: 'データ一覧' },
  { to: '/admin/master', label: 'マスター管理' },
  { to: '/admin/relationships', label: '紐付け管理' },
  { to: '/admin/users', label: 'ユーザー管理' },
  { to: '/admin/ad-slots', label: '広告枠' },
  { to: '/admin/settings', label: '設定' },
];

export function AdminSidebar() {
  const location = useLocation();

  const isActive = (item: (typeof adminNav)[number]) => {
    if (item.exact) return location.pathname === item.to;
    return location.pathname.startsWith(item.to);
  };

  return (
    <aside className="w-48 bg-gray-50 border-r border-gray-200 min-h-[calc(100vh-3.5rem)]">
      <nav className="p-3 space-y-1">
        {adminNav.map((item) => (
          <Link
            key={item.to}
            to={item.to}
            className={cn(
              'block px-3 py-2 rounded-md text-sm font-medium transition-colors',
              isActive(item)
                ? 'bg-blue-50 text-blue-700'
                : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900',
            )}
          >
            {item.label}
          </Link>
        ))}
      </nav>
    </aside>
  );
}
