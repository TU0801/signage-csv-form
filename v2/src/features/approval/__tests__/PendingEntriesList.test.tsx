import { describe, it, expect, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import { makeEntry } from '@/features/entries-list/__tests__/fixtures';

const auth = vi.hoisted(() => ({ state: { profile: null as { role: string } | null } }));
const pending = vi.hoisted(() => ({ extra: [] as unknown[] }));
vi.mock('@/stores/authStore', () => ({
  useAuthStore: (sel: (s: typeof auth.state) => unknown) => sel(auth.state),
}));
vi.mock('../hooks/usePendingEntries', () => ({
  usePendingEntries: () => ({
    entries: [makeEntry({ id: 'p1', status: 'draft' }), ...pending.extra],
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
vi.mock('@/lib/api/property-requests', () => ({
  fetchPropertyRequestsByIds: async () => [{ id: 'req-1', property_name: '新築マンション' }],
}));
vi.mock('../hooks/useRefetchOnVisible', () => ({ useRefetchOnVisible: () => {} }));
vi.mock('@/features/entries-list/hooks/useEntryLookups', () => ({
  useEntryLookups: () => ({ propertyNames: new Map(), emailOf: () => '-', displayDefault: undefined }),
}));
vi.mock('@/components/ui/Toast', () => ({ useToast: () => ({ addToast: vi.fn() }) }));
vi.mock('@/components/ui/ConfirmDialog', () => ({ ConfirmDialog: () => null }));
vi.mock('@/features/inspection-portal/components/SendBackDialog', () => ({ SendBackDialog: () => null }));
vi.mock('../components/EntryDetailModal', () => ({ EntryDetailModal: () => null }));
vi.mock('@/features/entries-list/components/EntryEditModal', () => ({ EntryEditModal: () => null }));
vi.mock('@/lib/api/portal', () => ({
  fetchPortalInspectionUnits: async () => [
    { inspection_id: 'i1', unit_id: 'u1', unit_code: 'No1', unit_sort: 1, maintainer_id: null, inspection_months: [], inspected_on: null, equipment_code: null },
    { inspection_id: 'i1', unit_id: 'u2', unit_code: 'No2', unit_sort: 2, maintainer_id: null, inspection_months: [], inspected_on: null, equipment_code: null },
  ],
}));

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

describe('PendingEntriesList の建物未承認（修正依頼1025 F2）', () => {
  it('未承認の建物の掲示の申請は「建物未承認」と建物名を出し、承認ボタンを押せない', async () => {
    auth.state.profile = { role: 'admin' };
    pending.extra = [
      makeEntry({ id: 'p2', status: 'draft', property_code: 'REQ-abcdef12', property_request_id: 'req-1' }),
    ];
    render(<PendingEntriesList />);
    const badge = await screen.findByTestId('buildingPendingBadge');
    const row = badge.closest('tr')!;
    expect(await within(row).findByText('新築マンション')).toBeInTheDocument();
    expect(within(row).getByRole('button', { name: '承認' })).toBeDisabled();
    // 通常の申請は承認できる
    const normal = screen.getAllByRole('row').find((r) => r !== row && within(r).queryByRole('button', { name: '承認' }));
    expect(within(normal!).getByRole('button', { name: '承認' })).toBeEnabled();
    pending.extra = [];
    auth.state.profile = null;
  });
});

describe('PendingEntriesList の号機（修正依頼1026 I7）', () => {
  it('台ごとの申請は物件名の下に台の No を出す（台なしの申請には出さない）', async () => {
    auth.state.profile = { role: 'admin' };
    pending.extra = [makeEntry({ id: 'p3', status: 'draft', property_inspection_id: 'i1', property_unit_id: 'u2' })];
    render(<PendingEntriesList />);
    expect(await screen.findByText('No2')).toBeInTheDocument();
    expect(screen.getAllByTestId('unit-code')).toHaveLength(1);
    pending.extra = [];
    auth.state.profile = null;
  });
});
