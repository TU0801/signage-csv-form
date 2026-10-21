import { Navigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';

/**
 * 1件入力・一括入力の入口。管理会社のアカウントは申請を作れない（DB 側でも拒否）ので点検ポータルへ送る。
 * ログイン済みかどうかは外側の ProtectedRoute が見る
 */
export function EntryRoute({ children }: { children: React.ReactNode }) {
  const { isManagement } = useAuth();
  if (isManagement) {
    return <Navigate to="/portal" replace />;
  }
  return <>{children}</>;
}
