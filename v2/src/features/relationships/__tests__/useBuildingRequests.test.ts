import { renderHook, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { useBuildingRequests } from '@/features/approval/hooks/useBuildingRequests';

const mockFetchPending = vi.fn();
const mockFetchEmails = vi.fn();
const mockApprove = vi.fn();
const mockReject = vi.fn();
const mockIn = vi.fn();
const mockProfile = { id: 'admin-uid', role: 'admin', vendor_id: null };

vi.mock('@/features/relationships/api', () => ({
  fetchPendingBuildingRequests: (...a: unknown[]) => mockFetchPending(...a),
  fetchProfileEmails: (...a: unknown[]) => mockFetchEmails(...a),
  approveBuildingRequest: (...a: unknown[]) => mockApprove(...a),
  rejectBuildingRequest: (...a: unknown[]) => mockReject(...a),
}));

vi.mock('@/lib/supabase', () => ({
  supabase: {
    from: () => ({ select: () => ({ in: (...a: unknown[]) => mockIn(...a) }) }),
  },
  TABLES: { properties: 'signage_master_properties' },
}));

vi.mock('@/stores/authStore', () => ({
  useAuthStore: (selector: (s: { profile: typeof mockProfile }) => unknown) =>
    selector({ profile: mockProfile }),
}));

// 実DBの signage_building_vendors の列 + signage_master_vendors(vendor_name) の埋め込み
const pendingRow = {
  id: 'bv1',
  property_code: '100',
  vendor_id: 'v1',
  status: 'pending',
  requested_by: 'user-uid',
  approved_by: null,
  created_at: '2026-03-10T00:00:00Z',
  updated_at: '2026-03-10T00:00:00Z',
  signage_master_vendors: { vendor_name: '保守A社' },
};

describe('useBuildingRequests', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFetchPending.mockResolvedValue([pendingRow]);
    mockFetchEmails.mockResolvedValue(new Map([['user-uid', 'user@example.com']]));
    mockIn.mockResolvedValue({
      data: [{ property_code: '100', property_name: 'テストマンション' }],
      error: null,
    });
    mockApprove.mockResolvedValue({});
  });

  it('申請に物件名・保守会社名・申請者のメールアドレスを付ける', async () => {
    const { result } = renderHook(() => useBuildingRequests());
    await act(async () => {
      await result.current.fetchPendingRequests();
    });
    expect(mockFetchEmails).toHaveBeenCalledWith(['user-uid']);
    expect(result.current.requests[0]).toMatchObject({
      id: 'bv1',
      propertyName: 'テストマンション',
      vendorName: '保守A社',
      requesterEmail: 'user@example.com',
    });
  });

  it('承認はログイン中の管理者の id を approved_by に渡して一覧を読み直す', async () => {
    const { result } = renderHook(() => useBuildingRequests());
    await act(async () => {
      await result.current.approveRequest('bv1');
    });
    expect(mockApprove).toHaveBeenCalledWith('bv1', 'admin-uid');
    expect(mockFetchPending).toHaveBeenCalledTimes(1);
  });
});
