import { useContext } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { useAuthStore } from '@/stores/authStore';
import { cn } from '@/lib/utils';
import { HeaderSlotContext } from './HeaderSlot';

export function AppHeader() {
  const { profile, isAdmin } = useAuth();
  const signOut = useAuthStore((s) => s.signOut);
  const location = useLocation();
  const { setTarget } = useContext(HeaderSlotContext);

  const navItems = [
    { to: '/', label: '1件入力' },
    { to: '/bulk', label: '一括入力' },
  ];

  return (
    <header className="bg-white border-b border-gray-200">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-14">
          <div className="flex items-center gap-6">
            <div className="flex items-center gap-2">
              <Link to="/" className="text-lg font-bold text-gray-900">
                サイネージCMS
              </Link>
              {/* v1: index.html / bulk.html / admin.html の #appVersion（js/version.js APP_VERSION） */}
              <span className="rounded bg-gray-100 px-1.5 py-0.5 text-xs text-gray-500">v{__APP_VERSION__}</span>
            </div>
            {/* 画面ごとの部品（管理者の保守会社セレクト）。HeaderSlot がここへ描く */}
            <div ref={setTarget} className="flex items-center empty:hidden" />
            <nav className="flex gap-1">
              {navItems.map((item) => (
                <Link
                  key={item.to}
                  to={item.to}
                  className={cn(
                    'px-3 py-2 rounded-md text-sm font-medium transition-colors',
                    location.pathname === item.to
                      ? 'bg-blue-50 text-blue-700'
                      : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900',
                  )}
                >
                  {item.label}
                </Link>
              ))}
              {isAdmin && (
                <Link
                  to="/admin"
                  className={cn(
                    'px-3 py-2 rounded-md text-sm font-medium transition-colors',
                    location.pathname.startsWith('/admin')
                      ? 'bg-blue-50 text-blue-700'
                      : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900',
                  )}
                >
                  管理
                </Link>
              )}
            </nav>
          </div>
          <div className="flex items-center gap-4">
            <span className="text-sm text-gray-500">{profile?.email}</span>
            <button
              onClick={signOut}
              className="text-sm text-gray-500 hover:text-gray-700 transition-colors"
            >
              ログアウト
            </button>
          </div>
        </div>
      </div>
    </header>
  );
}
