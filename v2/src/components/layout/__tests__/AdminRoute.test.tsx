import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { ToastProvider } from '@/components/ui/Toast';
import { AdminRoute } from '../AdminRoute';

vi.mock('@/hooks/useAuth', () => ({
  useAuth: () => ({
    user: { id: 'u1' },
    profile: { id: 'u1', role: 'user', vendor_id: 'v1' },
    loading: false,
    initialized: true,
    isAuthenticated: true,
    isAdmin: false,
  }),
}));

describe('AdminRoute', () => {
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
