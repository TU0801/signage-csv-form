import { useContext, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { useAuthStore } from '@/stores/authStore';
import { useBulkStore } from '@/stores/bulkStore';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { cn } from '@/lib/utils';
import { HeaderSlotContext } from './HeaderSlot';

/**
 * 一括入力に行があるときのログアウト確認。v1 はログアウトでページを移るときの beforeunload（js/bulk.js、
 * returnValue='' で文言はブラウザ既定）で確認していたので、Chrome の日本語の既定文言に合わせる。
 */
export const BULK_LOGOUT_CONFIRM_MESSAGE = 'このサイトを離れますか？\n行った変更が保存されない可能性があります。';

export function AppHeader() {
  const { profile, isAdmin } = useAuth();
  const signOut = useAuthStore((s) => s.signOut);
  const location = useLocation();
  const { setTarget } = useContext(HeaderSlotContext);
  const [confirmingLogout, setConfirmingLogout] = useState(false);

  // 一括入力の行は画面を移っても store に残るので、どの画面からのログアウトでも確認する
  const handleLogout = () => {
    if (useBulkStore.getState().rows.length > 0) {
      setConfirmingLogout(true);
      return;
    }
    void signOut();
  };

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
              onClick={handleLogout}
              className="text-sm text-gray-500 hover:text-gray-700 transition-colors"
            >
              ログアウト
            </button>
          </div>
        </div>
      </div>
      <ConfirmDialog
        open={confirmingLogout}
        onClose={() => setConfirmingLogout(false)}
        onConfirm={() => void signOut()}
        title="確認"
        message={BULK_LOGOUT_CONFIRM_MESSAGE}
        confirmLabel="ログアウト"
      />
    </header>
  );
}
