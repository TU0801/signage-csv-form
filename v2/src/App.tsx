import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { useEffect } from 'react';
import { useAuthStore } from '@/stores/authStore';
import { ToastProvider } from '@/components/ui/Toast';
import { ProtectedRoute } from '@/components/layout/ProtectedRoute';
import { AdminRoute } from '@/components/layout/AdminRoute';
import { UserLayout } from '@/components/layout/UserLayout';
import { AdminLayout } from '@/components/layout/AdminLayout';
import { SessionChangedOverlay } from '@/components/layout/SessionChangedOverlay';
import { installErrorLogging } from '@/lib/api/errorLog';
import { LoginPage } from '@/pages/LoginPage';
import { InspectionFormPage } from '@/pages/InspectionFormPage';
import { PortalDocumentsPage } from '@/pages/PortalDocumentsPage';
import { ApprovalPage } from '@/pages/admin/ApprovalPage';
import { EntriesPage } from '@/pages/admin/EntriesPage';
import { MasterPage } from '@/pages/admin/MasterPage';
import { RelationshipsPage } from '@/pages/admin/RelationshipsPage';
import { UsersPage } from '@/pages/admin/UsersPage';
import { AdSlotsPage } from '@/pages/admin/AdSlotsPage';

// エラーを signage_error_logs に保存する（v1 は error-handler.js を他のモジュールより先に読み込む）
installErrorLogging();

export default function App() {
  const initialize = useAuthStore((s) => s.initialize);

  useEffect(() => {
    const cleanup = initialize();
    return () => {
      cleanup.then((unsub) => unsub());
    };
  }, [initialize]);

  return (
    <ToastProvider>
      <SessionChangedOverlay />
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<LoginPage />} />

          {/* 点検登録フォーム（1件入力・一括入力・点検一覧をまとめた画面。修正依頼1024 B3）。列が多いので全幅 */}
          <Route
            element={
              <ProtectedRoute>
                <UserLayout width="full" />
              </ProtectedRoute>
            }
          >
            <Route index element={<InspectionFormPage />} />
            {/* 旧 URL（ブックマーク）は点検登録フォームへ */}
            <Route path="bulk" element={<Navigate to="/" replace />} />
          </Route>

          {/* 点検報告書（管理会社・保守会社・管理者）。旧「点検一覧」（/portal）は点検登録フォームへ */}
          <Route
            path="portal"
            element={
              <ProtectedRoute>
                <UserLayout width="full" />
              </ProtectedRoute>
            }
          >
            <Route index element={<Navigate to="/" replace />} />
            <Route path="documents" element={<PortalDocumentsPage />} />
          </Route>

          {/* Admin pages */}
          <Route
            path="admin"
            element={
              <AdminRoute>
                {/* 管理画面は上限なし。サイドバーを画面の左端に付ける */}
                <UserLayout width="full" />
              </AdminRoute>
            }
          >
            <Route element={<AdminLayout />}>
              <Route index element={<ApprovalPage />} />
              <Route path="entries" element={<EntriesPage />} />
              <Route path="master" element={<MasterPage />} />
              <Route path="relationships" element={<RelationshipsPage />} />
              <Route path="users" element={<UsersPage />} />
              <Route path="ad-slots" element={<AdSlotsPage />} />
              {/* 設定は v1 と同じくマスター管理のタブ */}
              <Route path="settings" element={<Navigate to="/admin/master?tab=settings" replace />} />
            </Route>
          </Route>

          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </ToastProvider>
  );
}
