import { useContext, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { useAuthStore } from '@/stores/authStore';
import { useBulkStore } from '@/stores/bulkStore';
import { hasUnsentSingleEntries, useSingleEntryStore } from '@/features/single-entry/stores/singleEntryStore';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { hasUnsentInput } from '@/features/bulk-entry/utils/scheduleRows';
import { useInspectionFormStore } from '@/stores/inspectionFormStore';
import { cn } from '@/lib/utils';
import { HeaderSlotContext } from './HeaderSlot';

/**
 * 一括入力の行・1件入力の作成データがあるときのログアウト確認。v1 はログアウトでページを移るときの beforeunload（js/bulk.js、
 * returnValue='' で文言はブラウザ既定）で確認していたので、Chrome の日本語の既定文言に合わせる。
 */
export const BULK_LOGOUT_CONFIRM_MESSAGE = 'このサイトを離れますか？\n行った変更が保存されない可能性があります。';

/** standard: 一般画面（v1 と同じ上限 1800px で中央寄せ） / full: 管理画面（上限なし。余白はサイドバーと本文側で持つ） */
export type LayoutWidth = 'standard' | 'full';

/** width は本文（UserLayout の main）と同じ値にして、ロゴと本文の左端をそろえる */
export function AppHeader({ width = 'standard' }: { width?: LayoutWidth }) {
  const { profile, isAdmin, isManagement } = useAuth();
  const signOut = useAuthStore((s) => s.signOut);
  const location = useLocation();
  const { setTarget } = useContext(HeaderSlotContext);
  const [confirmingLogout, setConfirmingLogout] = useState(false);

  // 一括入力の行・1件入力の申請前の作成データは画面を移っても store に残るので、どの画面からのログアウトでも確認する
  const handleLogout = () => {
    // 1件入力は今のユーザーの行だけ数える（別のユーザーが残した行で確認を出さない）
    // 一括入力の点検予定の行は、入力したものだけ数える（予定は開くたびに DB から出る）
    if (useBulkStore.getState().rows.some(hasUnsentInput) || hasUnsentSingleEntries()) {
      setConfirmingLogout(true);
      return;
    }
    // 別のユーザーが残した行があっても、ログアウトで捨てる
    useSingleEntryStore.getState().clear();
    useInspectionFormStore.getState().setManagementCompanyId('');
    void signOut();
  };

  // 点検登録フォーム（1件入力・一括入力・点検一覧をまとめた画面。管理会社には点検一覧を出す）と点検報告書（修正依頼1024 B3）
  const navItems = [
    { to: '/', label: '点検登録フォーム' },
    { to: '/portal/documents', label: '点検報告書' },
  ];

  return (
    // 高さは枠線込みで --header-h（border-box）。サイドバーや画面の高さに合わせる枠はこの変数で引き算する
    <header className="sticky top-0 z-30 h-[var(--header-h)] bg-white border-b border-gray-200">
      <div className={cn('h-full px-3 lg:px-4', width === 'full' ? 'max-w-none' : 'max-w-[1800px] mx-auto')}>
        <div className="flex items-center justify-between h-full">
          <div className="flex items-center gap-6">
            <div className="flex items-center gap-2">
              <Link to="/" className="text-lg font-bold text-gray-900">
                設備点検管理システム
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
              {/* 管理者メニュー（旧『管理』。B5）。管理会社には自社物件の範囲の『管理会社メニュー』として出す（C2。AdminRoute が通す） */}
              {(isAdmin || isManagement) && (
                <Link
                  to="/admin"
                  className={cn(
                    'px-3 py-2 rounded-md text-sm font-medium transition-colors',
                    location.pathname.startsWith('/admin')
                      ? 'bg-blue-50 text-blue-700'
                      : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900',
                  )}
                >
                  {isAdmin ? '管理者メニュー' : '管理会社メニュー'}
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
        onConfirm={() => {
          // 1件入力の作成データは確認のうえ捨てる（同じタブで別のユーザーが入っても残さない）
          useSingleEntryStore.getState().clear();
          useInspectionFormStore.getState().setManagementCompanyId('');
          void signOut();
        }}
        title="確認"
        message={BULK_LOGOUT_CONFIRM_MESSAGE}
        confirmLabel="ログアウト"
      />
    </header>
  );
}
