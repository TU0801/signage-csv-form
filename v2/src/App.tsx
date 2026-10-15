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
import { SingleEntryPage } from '@/pages/SingleEntryPage';
import { BulkEntryPage } from '@/pages/BulkEntryPage';
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

          {/* User pages */}
          <Route
            element={
              <ProtectedRoute>
                <UserLayout />
              </ProtectedRoute>
            }
          >
            <Route index element={<SingleEntryPage />} />
            <Route path="bulk" element={<BulkEntryPage />} />
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
