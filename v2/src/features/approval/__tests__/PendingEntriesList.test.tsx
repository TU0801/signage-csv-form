import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { makeEntry } from '@/features/entries-list/__tests__/fixtures';

const auth = vi.hoisted(() => ({ state: { profile: null as { role: string } | null } }));
vi.mock('@/stores/authStore', () => ({
  useAuthStore: (sel: (s: typeof auth.state) => unknown) => sel(auth.state),
}));
vi.mock('../hooks/usePendingEntries', () => ({
  usePendingEntries: () => ({
    entries: [makeEntry({ id: 'p1', status: 'draft' })],
    loading: false,
    error: null,
    fetchPendingEntries: vi.fn(),
    approveEntry: vi.fn(),
    rejectEntry: vi.fn(),
    approveBulk: vi.fn(),
    rejectBulk: vi.fn(),
    sendBackEntry: vi.fn(),
  }),
}));
vi.mock('@/lib/api/admin-entries', () => ({ entryErrorReason: () => '理由' }));
vi.mock('../hooks/useRefetchOnVisible', () => ({ useRefetchOnVisible: () => {} }));
vi.mock('@/features/entries-list/hooks/useEntryLookups', () => ({
  useEntryLookups: () => ({ propertyNames: new Map(), emailOf: () => '-', displayDefault: undefined }),
}));
vi.mock('@/components/ui/Toast', () => ({ useToast: () => ({ addToast: vi.fn() }) }));
vi.mock('@/components/ui/ConfirmDialog', () => ({ ConfirmDialog: () => null }));
vi.mock('@/features/inspection-portal/components/SendBackDialog', () => ({ SendBackDialog: () => null }));
vi.mock('../components/EntryDetailModal', () => ({ EntryDetailModal: () => null }));
vi.mock('@/features/entries-list/components/EntryEditModal', () => ({ EntryEditModal: () => null }));

import { PendingEntriesList } from '../components/PendingEntriesList';

describe('PendingEntriesList の差戻し（修正依頼1024 F1）', () => {
  it('管理者にも行の「差戻し」を出す（点検一覧が点検登録フォームに入り、管理者が差し戻す画面がここだけになった）', () => {
    auth.state.profile = { role: 'admin' };
    render(<PendingEntriesList />);
    expect(screen.getByRole('button', { name: '差戻し' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '却下' })).toBeInTheDocument();
    expect(screen.queryByText(/点検一覧から行います/)).not.toBeInTheDocument();
    auth.state.profile = null;
  });
});
