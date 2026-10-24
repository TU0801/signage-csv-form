import { renderHook, act, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { useUsers } from '../hooks/useUsers';
import {
  getSessionFiltersForTest,
  resetSessionFiltersForTest,
  todayForFilter,
} from '@/features/entries-list/hooks/useEntriesFilters';

const mockSelect = vi.fn();
const mockUpdate = vi.fn();
const mockCreateUser = vi.fn();
const mockSetUserPassword = vi.fn();
const mockFetchVendors = vi.fn();
const mockFetchManagementCompanies = vi.fn();
const mockEq = vi.fn();
const mockOrder = vi.fn();
const mockSingle = vi.fn();
const calls: string[] = [];

vi.mock('@/lib/supabase', () => ({
  supabase: {
    from: vi.fn(() => ({
      select: mockSelect,
      update: mockUpdate,
    })),
  },
  TABLES: {
    profiles: 'signage_profiles',
  },
}));

const mockSetUserStatus = vi.fn();
const mockFetchOwnCompany = vi.fn();
const mockFetchVendorIds = vi.fn();
vi.mock('@/lib/api/users', () => ({
  createUser: (...args: unknown[]) => mockCreateUser(...args),
  setUserPassword: (...args: unknown[]) => mockSetUserPassword(...args),
  setUserStatus: (...args: unknown[]) => mockSetUserStatus(...args),
  fetchOwnManagementCompany: () => mockFetchOwnCompany(),
  fetchManagementVendorIds: () => mockFetchVendorIds(),
}));

vi.mock('@/lib/api/masterData', () => ({
  fetchMasterVendors: () => mockFetchVendors(),
}));

vi.mock('@/lib/api/portal', () => ({
  fetchManagementCompanies: () => mockFetchManagementCompanies(),
}));

// ログイン中の管理者は id 'me'（管理会社の場合だけ profile.role を management にする）
const authState = vi.hoisted(() => ({ profile: null as { role: string } | null }));
vi.mock('@/stores/authStore', () => ({
  useAuthStore: (selector: (s: { user: { id: string }; profile: { role: string } | null }) => unknown) =>
    selector({ user: { id: 'me' }, profile: authState.profile }),
}));

/** signage_profiles の実列 */
const profile = (id: string, over: Record<string, unknown> = {}) => ({
  id,
  email: `${id}@example.com`,
  company_name: null,
  role: 'user',
  vendor_id: 'v1',
  status: 'active',
  created_at: '2026-09-13T02:00:00+00:00',
  updated_at: null,
  ...over,
});

async function renderReady() {
  const hook = renderHook(() => useUsers());
  await waitFor(() => expect(hook.result.current.loading).toBe(false));
  return hook;
}

describe('useUsers', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    calls.length = 0;

    mockSelect.mockReturnValue({ order: mockOrder });
    mockOrder.mockResolvedValue({ data: [], error: null });
    mockFetchVendors.mockResolvedValue([{ id: 'v1', vendor_name: '保守A' }]);
    mockFetchManagementCompanies.mockResolvedValue([{ id: 'm1', name: '管理A' }]);
    // Edge Function の戻り値（create_user は { user: profile } を lib/api が user にして返す / set_password は { ok: true }）
    mockCreateUser.mockResolvedValue(profile('u2'));
    mockSetUserPassword.mockImplementation(async () => {
      calls.push('password');
    });
    mockUpdate.mockImplementation((body: unknown) => {
      calls.push(`update:${JSON.stringify(body)}`);
      return { eq: mockEq };
    });
    mockSingle.mockResolvedValue({ data: profile('u1'), error: null });
    mockEq.mockImplementation(() => ({ select: () => ({ single: mockSingle }) }));
  });

  it('fetches users newest first and the vendors for the modals', async () => {
    const rows = [profile('u1')];
    mockOrder.mockResolvedValue({ data: rows, error: null });

    const { result } = await renderReady();

    expect(mockOrder).toHaveBeenCalledWith('created_at', { ascending: false });
    expect(result.current.users).toEqual(rows);
    expect(result.current.vendors).toEqual([{ id: 'v1', vendor_name: '保守A' }]);
    expect(result.current.managementCompanies).toEqual([{ id: 'm1', name: '管理A' }]);
    expect(result.current.currentUserId).toBe('me');
  });

  it('handles fetch error', async () => {
    mockOrder.mockResolvedValue({ data: null, error: { message: 'Fetch failed' } });
    const { result } = await renderReady();
    expect(result.current.error).toBeTruthy();
  });

  it('addUser creates the account through the Edge Function (no direct profiles insert)', async () => {
    const { result } = await renderReady();

    await act(async () => {
      await result.current.addUser({
        email: 'new@test.com',
        password: 'secret123',
        role: 'user',
        vendor_id: 'v1',
      });
    });

    expect(mockCreateUser).toHaveBeenCalledWith({
      email: 'new@test.com',
      password: 'secret123',
      role: 'user',
      vendorId: 'v1',
      managementCompanyId: null,
    });
  });

  it('addUser requires a management company for a management account and drops the vendor', async () => {
    const { result } = await renderReady();

    await expect(
      result.current.addUser({ email: 'm@test.com', password: 'secret123', role: 'management', vendor_id: 'v1' }),
    ).rejects.toThrow('管理会社を選択してください');
    expect(mockCreateUser).not.toHaveBeenCalled();

    await act(async () => {
      await result.current.addUser({
        email: 'm@test.com',
        password: 'secret123',
        role: 'management',
        vendor_id: 'v1',
        management_company_id: 'm1',
      });
    });
    expect(mockCreateUser).toHaveBeenCalledWith(
      expect.objectContaining({ role: 'management', vendorId: null, managementCompanyId: 'm1' }),
    );
  });

  it('addUser requires a vendor for a general user but not for an admin', async () => {
    const { result } = await renderReady();

    await expect(
      result.current.addUser({ email: 'a@test.com', password: 'secret123', role: 'user', vendor_id: null }),
    ).rejects.toThrow('保守会社を選択してください');
    expect(mockCreateUser).not.toHaveBeenCalled();

    await act(async () => {
      await result.current.addUser({
        email: 'b@test.com',
        password: 'secret123',
        role: 'admin',
        vendor_id: null,
      });
    });
    expect(mockCreateUser).toHaveBeenCalledWith(expect.objectContaining({ role: 'admin', vendorId: null }));
  });

  it('editUser changes the password before saving role/vendor', async () => {
    const { result } = await renderReady();

    let changed = false;
    await act(async () => {
      changed = await result.current.editUser('u1', { role: 'admin', vendor_id: null, password: 'newpass1' });
    });

    expect(changed).toBe(true);
    expect(mockSetUserPassword).toHaveBeenCalledWith('u1', 'newpass1');
    expect(calls).toEqual(['password', 'update:{"role":"admin","vendor_id":null,"management_company_id":null}']);
  });

  it('editUser does not save role/vendor when the password change is refused', async () => {
    mockSetUserPassword.mockRejectedValue(
      new Error('このアカウントは他のシステムと共用のため、ここではパスワードを変更できません'),
    );
    const { result } = await renderReady();

    await expect(
      result.current.editUser('u1', { role: 'admin', vendor_id: null, password: 'newpass1' }),
    ).rejects.toThrow('共用');
    expect(mockUpdate).not.toHaveBeenCalled();
  });

  it('editUser tells that the password was changed when only the profile save fails', async () => {
    mockSingle.mockResolvedValue({ data: null, error: new Error('0 rows') });
    const { result } = await renderReady();

    await expect(
      result.current.editUser('u1', { role: 'user', vendor_id: 'v1', password: 'newpass1' }),
    ).rejects.toThrow('パスワードは変更済みですが、権限・会社の保存に失敗しました（0 rows）');
  });

  it('editUser moves a vendor account to a management company (vendor cleared, company required)', async () => {
    const { result } = await renderReady();

    await expect(
      result.current.editUser('u1', { role: 'management', vendor_id: 'v1', management_company_id: null }),
    ).rejects.toThrow('管理会社を選択してください');
    expect(mockUpdate).not.toHaveBeenCalled();

    await act(async () => {
      await result.current.editUser('u1', { role: 'management', vendor_id: 'v1', management_company_id: 'm1' });
    });
    expect(mockUpdate).toHaveBeenCalledWith({ role: 'management', vendor_id: null, management_company_id: 'm1' });
  });

  it('editUser without a password skips the Edge Function and rejects a short one', async () => {
    const { result } = await renderReady();

    await expect(
      result.current.editUser('u1', { role: 'user', vendor_id: 'v1', password: '123' }),
    ).rejects.toThrow('パスワードは6文字以上で入力してください');

    let changed = true;
    await act(async () => {
      changed = await result.current.editUser('u1', { role: 'user', vendor_id: 'v1', password: '' });
    });
    expect(changed).toBe(false);
    expect(mockSetUserPassword).not.toHaveBeenCalled();
  });

  it('editUser puts today back into an emptied data-list start date (v1 handleEditUserSubmit → reloadAll)', async () => {
    resetSessionFiltersForTest();
    const { result } = await renderReady();
    await act(async () => {
      await result.current.editUser('u1', { role: 'user', vendor_id: 'v1' });
    });
    expect(getSessionFiltersForTest()?.startDate).toBe(todayForFilter());
  });

  it('updateUserStatus deactivates with status=inactive and throws when RLS skips the UPDATE', async () => {
    const { result } = await renderReady();

    await act(async () => {
      await result.current.updateUserStatus('u1', 'inactive');
    });
    expect(mockUpdate).toHaveBeenCalledWith({ status: 'inactive' });

    mockSingle.mockResolvedValue({ data: null, error: { code: 'PGRST116', message: '0 rows' } });
    await expect(result.current.updateUserStatus('u1', 'active')).rejects.toMatchObject({
      code: 'PGRST116',
    });
  });

  it('refuses to edit or deactivate the signed-in user', async () => {
    const { result } = await renderReady();

    await expect(result.current.updateUserStatus('me', 'inactive')).rejects.toThrow(
      '自分を無効化することはできません',
    );
    await expect(
      result.current.editUser('me', { role: 'user', vendor_id: 'v1' }),
    ).rejects.toThrow('自分は編集できません');
    expect(mockUpdate).not.toHaveBeenCalled();
  });
});

describe('useUsers（管理会社: 修正依頼1024 C3）', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    authState.profile = { role: 'management' };
    mockSelect.mockReturnValue({ order: mockOrder });
    mockOrder.mockResolvedValue({ data: [profile('m2', { role: 'management', vendor_id: null })], error: null });
    mockFetchVendors.mockResolvedValue([
      { id: 'v1', vendor_name: '保守A' },
      { id: 'v2', vendor_name: '保守B' },
    ]);
    mockFetchVendorIds.mockResolvedValue(new Set(['v1']));
    mockFetchOwnCompany.mockResolvedValue([{ id: 'm1', name: '自社' }]);
  });

  it('保守会社の候補は自社物件の担当だけ、管理会社は自社だけ。編集はパスワードだけ、無効化は Edge Function で行う', async () => {
    const { result } = await renderReady();
    await waitFor(() => expect(result.current.vendors).toEqual([{ id: 'v1', vendor_name: '保守A' }]));
    expect(result.current.managementCompanies).toEqual([{ id: 'm1', name: '自社' }]);
    expect(mockFetchManagementCompanies).not.toHaveBeenCalled();

    await act(() =>
      result.current.editUser('m2', { role: 'management', vendor_id: null, management_company_id: 'm1', password: 'secret1' }),
    );
    expect(mockSetUserPassword).toHaveBeenCalledWith('m2', 'secret1');
    await act(() => result.current.updateUserStatus('m2', 'inactive'));
    expect(mockSetUserStatus).toHaveBeenCalledWith('m2', 'inactive');
    // profiles の表は直接更新しない（権限列のガードが管理会社の更新を断るため）
    expect(mockUpdate).not.toHaveBeenCalled();
    authState.profile = null;
  });
});
