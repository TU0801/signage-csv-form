import { useEffect, useRef } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { Spinner } from '@/components/ui/Spinner';
import { useToast } from '@/components/ui/Toast';

export const ADMIN_REQUIRED_MESSAGE = '管理者権限が必要です';

interface AdminRouteProps {
  children: React.ReactNode;
  /**
   * 管理者だけの画面（広告枠管理）。省略時は管理者と管理会社が入れる（修正依頼1024 C2: 管理会社メニュー）。
   * 管理会社がここへ来たら管理会社メニューの先頭（/admin）へ戻す
   */
  adminOnly?: boolean;
}

export function AdminRoute({ children, adminOnly = false }: AdminRouteProps) {
  const { isAuthenticated, isAdmin, isManagement, loading, initialized } = useAuth();
  const { addToast } = useToast();
  const allowed = isAdmin || (!adminOnly && isManagement);
  const denied = initialized && !loading && isAuthenticated && !allowed;
  const notified = useRef(false);

  // v1: js/admin.js init（profile.role !== 'admin' なら alert('管理者権限が必要です') → index.html）
  // トーストは Router の外の ToastProvider にあるので、'/' へ移った後も残る。StrictMode の二重実行で2回出さない
  useEffect(() => {
    if (denied && !notified.current) {
      notified.current = true;
      addToast(ADMIN_REQUIRED_MESSAGE, 'error');
    }
  }, [denied, addToast]);

  if (!initialized || loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Spinner size="lg" />
      </div>
    );
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  if (!allowed) {
    return <Navigate to={isManagement ? '/admin' : '/'} replace />;
  }

  return <>{children}</>;
}
