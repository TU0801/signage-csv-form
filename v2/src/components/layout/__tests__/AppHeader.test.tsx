import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { AppHeader } from '../AppHeader';
import { useAuthStore } from '@/stores/authStore';
import { useBulkStore } from '@/stores/bulkStore';
import type { BulkEntryRow } from '@/features/bulk-entry/types';

vi.mock('@/lib/supabase', () => ({ supabase: {}, TABLES: {} }));
vi.mock('@/hooks/useAuth', () => ({
  useAuth: () => ({ profile: { id: 'u1', role: 'user', email: 'a@example.com' }, isAdmin: false }),
}));

const signOut = vi.fn(async () => {});

beforeEach(() => {
  // jsdom には <dialog> の showModal / close が無い（ConfirmDialog が使う）
  HTMLDialogElement.prototype.showModal ??= function () {};
  HTMLDialogElement.prototype.close ??= function () {};
  signOut.mockClear();
  useAuthStore.setState({ signOut });
});

const renderHeader = () =>
  render(
    <MemoryRouter initialEntries={['/bulk']}>
      <AppHeader />
    </MemoryRouter>,
  );

describe('ログアウト（v1 js/bulk.js beforeunload）', () => {
  it('一括入力に行があるときは確認してからログアウトし、キャンセルならログアウトしない', () => {
    useBulkStore.setState({ rows: [{ id: 1 } as BulkEntryRow] });
    renderHeader();

    fireEvent.click(screen.getByRole('button', { name: 'ログアウト' }));
    expect(signOut).not.toHaveBeenCalled();
    expect(screen.getByText(/このサイトを離れますか？/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'キャンセル', hidden: true }));
    expect(signOut).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'ログアウト' }));
    // 確認ダイアログの「ログアウト」（ヘッダーのボタンの次）
    const buttons = screen.getAllByRole('button', { name: 'ログアウト', hidden: true });
    fireEvent.click(buttons[buttons.length - 1]!);
    expect(signOut).toHaveBeenCalledTimes(1);
  });

  it('行が無ければ確認せずにログアウトする', () => {
    useBulkStore.setState({ rows: [] });
    renderHeader();
    fireEvent.click(screen.getByRole('button', { name: 'ログアウト' }));
    expect(signOut).toHaveBeenCalledTimes(1);
  });
});
