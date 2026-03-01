import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { useEffect } from 'react';
import { useAuthStore } from '@/stores/authStore';
import { ToastProvider } from '@/components/ui/Toast';
import { ProtectedRoute } from '@/components/layout/ProtectedRoute';
import { AdminRoute } from '@/components/layout/AdminRoute';
import { UserLayout } from '@/components/layout/UserLayout';
import { AdminLayout } from '@/components/layout/AdminLayout';
import { LoginPage } from '@/pages/LoginPage';
import { SingleEntryPage } from '@/pages/SingleEntryPage';
import { BulkEntryPage } from '@/pages/BulkEntryPage';
import { ApprovalPage } from '@/pages/admin/ApprovalPage';
import { EntriesPage } from '@/pages/admin/EntriesPage';
import { MasterPage } from '@/pages/admin/MasterPage';
import { RelationshipsPage } from '@/pages/admin/RelationshipsPage';
import { UsersPage } from '@/pages/admin/UsersPage';
import { AdSlotsPage } from '@/pages/admin/AdSlotsPage';
import { SettingsPage } from '@/pages/admin/SettingsPage';

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
                <UserLayout />
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
              <Route path="settings" element={<SettingsPage />} />
            </Route>
          </Route>

          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </ToastProvider>
  );
}
