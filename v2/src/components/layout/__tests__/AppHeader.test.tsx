import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { AppHeader } from '../AppHeader';
import { useAuthStore } from '@/stores/authStore';
import { useBulkStore } from '@/stores/bulkStore';
import type { BulkEntryRow } from '@/features/bulk-entry/types';

vi.mock('@/lib/supabase', () => ({ supabase: {}, TABLES: {} }));
const auth = vi.hoisted(() => ({ isAdmin: false, isManagement: false }));
vi.mock('@/hooks/useAuth', () => ({
  useAuth: () => ({ profile: { id: 'u1', role: 'user', email: 'a@example.com' }, ...auth }),
}));

const signOut = vi.fn(async () => {});

beforeEach(() => {
  // jsdom には <dialog> の showModal / close が無い（ConfirmDialog が使う）
  HTMLDialogElement.prototype.showModal ??= function () {};
  HTMLDialogElement.prototype.close ??= function () {};
  signOut.mockClear();
  useAuthStore.setState({ signOut });
  auth.isAdmin = false;
  auth.isManagement = false;
});

describe('ナビ（修正依頼1024 B3・B5）', () => {
  const links = () => screen.getAllByRole('link').map((a) => a.textContent);
  it('点検登録フォーム・点検報告書。管理者メニューは管理者と管理会社に出す', () => {
    const { unmount } = renderHeader();
    expect(links()).toEqual(['サイネージCMS', '点検登録フォーム', '点検報告書']);
    unmount();
    auth.isManagement = true;
    const second = renderHeader();
    expect(links()).toEqual(['サイネージCMS', '点検登録フォーム', '点検報告書', '管理者メニュー']);
    second.unmount();
    auth.isManagement = false;
    auth.isAdmin = true;
    renderHeader();
    expect(links()).toContain('管理者メニュー');
  });
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

  it('入力していない点検予定の行だけなら確認しない', () => {
    const schedule = { key: 'k', inspectionId: 'i1', targetMonth: '2026-11-01', locked: false, propertyName: '', terminalIds: [] };
    useBulkStore.setState({ rows: [{ id: 1, schedule, startDate: '', remarks: '', memo: '' } as unknown as BulkEntryRow] });
    renderHeader();
    fireEvent.click(screen.getByRole('button', { name: 'ログアウト' }));
    expect(signOut).toHaveBeenCalledTimes(1);
  });
});
