import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';

/*
 * 管理会社の審査（任意。修正依頼1025 D4）: 管理会社は自社が管理会社の建物追加の申請を「審査済み（承認推奨）」か差戻しにできる。
 * 承認（物件コードを入れる）は管理者だけ
 */

const auth = vi.hoisted(() => ({ state: { profile: { role: 'management' } as { role: string } | null } }));
vi.mock('@/stores/authStore', () => ({
  useAuthStore: (sel: (s: typeof auth.state) => unknown) => sel(auth.state),
}));
vi.mock('@/lib/supabase', () => ({ supabase: {}, TABLES: {}, RPC: {} }));
vi.mock('@/components/ui/Toast', () => ({ useToast: () => ({ addToast: vi.fn() }) }));
vi.mock('../hooks/useRefetchOnVisible', () => ({ useRefetchOnVisible: () => {} }));
vi.mock('@/lib/api/masterData', () => ({
  // 管理会社のアカウントでは読めないことがある（読めなくても一覧は出す）
  fetchMasterVendors: async () => {
    throw new Error('permission denied');
  },
  fetchMasterInspectionTypes: async () => [],
}));
vi.mock('@/features/relationships/api', () => ({ fetchProfileEmails: async () => new Map() }));
const api = vi.hoisted(() => ({
  review: vi.fn(async () => ({})),
  rows: [] as unknown[],
}));
vi.mock('@/lib/api/property-requests', () => ({
  approvePropertyRequest: vi.fn(),
  rejectPropertyRequest: vi.fn(),
  fetchManagementCompaniesForRequest: async () => [],
  fetchPendingPropertyRequests: async () => api.rows,
  fetchPropertyRequestEntryCounts: async () => new Map([['r1', 2]]),
  mgmtReviewPropertyRequest: api.review,
}));

import { PropertyRequestsList } from '../components/PropertyRequestsList';

beforeEach(() => {
  HTMLDialogElement.prototype.showModal ??= function () {};
  HTMLDialogElement.prototype.close ??= function () {};
  api.review.mockClear();
  api.rows = [
    {
      id: 'r1',
      property_name: '新築マンション',
      vendor_id: 'v1',
      management_company_id: 'm1',
      inspection_type_id: null,
      inspection_months: [],
      requested_by: null,
      mgmt_reviewed_at: null,
      created_at: '2026-10-25T00:00:00Z',
    },
  ];
});

describe('PropertyRequestsList（管理会社）', () => {
  it('承認・却下の代わりに「審査済みにする」「差戻し」を出し、建物未承認の掲示の申請の件数を出す。差戻しは理由が要る', async () => {
    render(<PropertyRequestsList />);
    const row = (await screen.findByText('新築マンション')).closest('tr')!;
    expect(within(row).getByTestId('propertyRequestEntryCount')).toHaveTextContent('2件（建物未承認）');
    expect(within(row).getByTestId('propertyRequestMgmtReview')).toHaveTextContent('未審査');
    expect(within(row).queryByRole('button', { name: '承認' })).toBeNull();

    fireEvent.click(within(row).getByRole('button', { name: '差戻し' }));
    fireEvent.click(screen.getByRole('button', { name: '差し戻す', hidden: true }));
    expect(screen.getByText('差戻しの理由を入力してください')).toBeInTheDocument();
    expect(api.review).not.toHaveBeenCalled();
    expect(screen.getByText(/この建物の掲示の申請2件（建物未承認）は削除されます/)).toBeInTheDocument();

    fireEvent.change(document.getElementById('propertyRequestMgmtComment')!, {
      target: { value: '自社の物件ではありません' },
    });
    fireEvent.click(screen.getByRole('button', { name: '差し戻す', hidden: true }));
    await waitFor(() => expect(api.review).toHaveBeenCalledWith('r1', 'reject', '自社の物件ではありません'));
  });

  it('管理者には審査の状態を出し、承認・却下のボタンを出す', async () => {
    auth.state.profile = { role: 'admin' };
    api.rows = [{ ...(api.rows[0] as object), mgmt_reviewed_at: '2026-10-25T01:00:00Z', mgmt_comment: '確認済み' }];
    render(<PropertyRequestsList />);
    const row = (await screen.findByText('新築マンション')).closest('tr')!;
    expect(within(row).getByTestId('propertyRequestMgmtReview')).toHaveTextContent('審査済み（承認推奨）: 確認済み');
    expect(within(row).getByRole('button', { name: '承認' })).toBeInTheDocument();
    expect(within(row).queryByRole('button', { name: '審査済みにする' })).toBeNull();
    auth.state.profile = { role: 'management' };
  });
});
