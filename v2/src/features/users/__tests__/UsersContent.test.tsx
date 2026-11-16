import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { ReactNode } from 'react';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';

/* ユーザーの削除（修正依頼1115 (1)）: 無効な行（自分以外）だけに「削除」を出し、確認ダイアログにメールを出す */

const hook = vi.hoisted(() => ({ deleteUser: vi.fn(async () => {}), users: [] as unknown[] }));
vi.mock('../hooks/useUsers', () => ({
  useUsers: () => ({
    users: hook.users,
    vendors: [],
    managementCompanies: [],
    currentUserId: 'me',
    isManagement: false,
    loading: false,
    error: null,
    addUser: vi.fn(),
    editUser: vi.fn(),
    updateUserStatus: vi.fn(),
    deleteUser: hook.deleteUser,
  }),
}));
vi.mock('@/components/ui/Toast', () => ({ useToast: () => ({ addToast: vi.fn() }) }));
// jsdom の <dialog> には showModal() が無いので、Modal は開いているときだけ中身をそのまま描く
vi.mock('@/components/ui/Modal', () => ({
  Modal: ({ open, title, children, footer }: { open: boolean; title: string; children: ReactNode; footer: ReactNode }) =>
    open ? (
      <div role="dialog" aria-label={title}>
        {children}
        {footer}
      </div>
    ) : null,
}));

import { UsersContent } from '../components/UsersContent';

const row = (id: string, status: 'active' | 'inactive') => ({
  id,
  email: `${id}@example.com`,
  company_name: null,
  role: 'admin',
  vendor_id: null,
  management_company_id: null,
  status,
  created_at: '2026-11-01T00:00:00Z',
  updated_at: null,
});

beforeEach(() => {
  hook.deleteUser.mockClear();
  hook.users = [row('me', 'inactive'), row('on', 'active'), row('off', 'inactive')];
});

describe('UsersContent の削除', () => {
  it('無効な行（自分以外）だけに削除を出し、確認してから消す', async () => {
    render(<UsersContent />);
    const rowOf = (email: string) => screen.getByText(email, { exact: false }).closest('tr')!;
    expect(within(rowOf('me@example.com')).queryByRole('button', { name: '削除' })).toBeNull();
    expect(within(rowOf('on@example.com')).queryByRole('button', { name: '削除' })).toBeNull();

    fireEvent.click(within(rowOf('off@example.com')).getByRole('button', { name: '削除' }));
    const confirm = screen.getByRole('dialog', { name: 'ユーザーの削除' });
    expect(within(confirm).getByText(/このユーザーを削除します。元に戻せません。/).textContent).toContain('off@example.com');
    expect(hook.deleteUser).not.toHaveBeenCalled();
    fireEvent.click(within(confirm).getByRole('button', { name: '削除' }));
    await waitFor(() => expect(hook.deleteUser).toHaveBeenCalledWith('off'));
  });
});
