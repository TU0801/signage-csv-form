import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { ToastProvider } from '@/components/ui/Toast';
import { AdminRoute } from '../AdminRoute';

const auth = vi.hoisted(() => ({ role: 'user' as 'user' | 'management' }));
vi.mock('@/hooks/useAuth', () => ({
  useAuth: () => ({
    user: { id: 'u1' },
    profile: { id: 'u1', role: auth.role, vendor_id: auth.role === 'user' ? 'v1' : null },
    loading: false,
    initialized: true,
    isAuthenticated: true,
    isAdmin: false,
    isManagement: auth.role === 'management',
  }),
}));

function renderAdmin(path: string) {
  return render(
    <ToastProvider>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path="/" element={<p>入力画面</p>} />
          <Route
            path="/admin"
            element={
              <AdminRoute>
                <p>管理画面</p>
              </AdminRoute>
            }
          />
          <Route
            path="/admin/ad-slots"
            element={
              <AdminRoute>
                <AdminRoute adminOnly>
                  <p>広告枠管理</p>
                </AdminRoute>
              </AdminRoute>
            }
          />
        </Routes>
      </MemoryRouter>
    </ToastProvider>,
  );
}

describe('AdminRoute', () => {
  it('管理会社は管理会社メニュー（/admin）に入れるが、広告枠管理（adminOnly）は /admin へ戻す（修正依頼1024 C2）', () => {
    auth.role = 'management';
    renderAdmin('/admin');
    expect(screen.getByText('管理画面')).toBeInTheDocument();
    renderAdmin('/admin/ad-slots');
    expect(screen.queryByText('広告枠管理')).not.toBeInTheDocument();
    expect(screen.getAllByText('管理画面').length).toBeGreaterThanOrEqual(2);
    expect(screen.getAllByText('管理者権限が必要です')).toHaveLength(1);
    auth.role = 'user';
  });

  it('一般ユーザーが /admin を開くと「管理者権限が必要です」を出して / へ戻す（v1 admin.js init）', () => {
    render(
      <ToastProvider>
        <MemoryRouter initialEntries={['/admin/users']}>
          <Routes>
            <Route path="/" element={<p>入力画面</p>} />
            <Route
              path="/admin/*"
              element={
                <AdminRoute>
                  <p>管理画面</p>
                </AdminRoute>
              }
            />
          </Routes>
        </MemoryRouter>
      </ToastProvider>,
    );
    expect(screen.getByText('入力画面')).toBeInTheDocument();
    expect(screen.queryByText('管理画面')).not.toBeInTheDocument();
    expect(screen.getAllByText('管理者権限が必要です')).toHaveLength(1);
  });
});
