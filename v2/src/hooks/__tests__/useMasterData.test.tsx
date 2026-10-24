import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';

const api = vi.hoisted(() => ({
  fetchAllMasterData: vi.fn(async () => ({ properties: [], vendors: [], inspectionTypes: [], categories: [], templateImages: [] })),
}));
vi.mock('@/lib/api/masterData', () => api);
vi.mock('@/lib/supabase', () => ({ supabase: { auth: {} }, TABLES: {}, RPC: {} }));

import { useAuthStore } from '@/stores/authStore';
import { useMasterData } from '../useMasterData';

afterEach(() => {
  useAuthStore.setState({ user: null, profile: null });
  vi.clearAllMocks();
});

describe('useMasterData', () => {
  it('ログアウトした（ユーザーが外れた）後は読み直さない（未ログインでマスタ・RPC を叩いて失敗とエラーログを出さない）', async () => {
    useAuthStore.setState({ user: { id: 'u1' } as never, profile: { id: 'u1', role: 'user', vendor_id: 'v1' } as never });
    renderHook(() => useMasterData());
    await waitFor(() => expect(api.fetchAllMasterData).toHaveBeenCalledTimes(1));

    // signOut は先に画面のユーザーとプロファイルを外す
    act(() => useAuthStore.setState({ user: null, session: null, profile: null }));
    await new Promise((r) => setTimeout(r, 20));
    expect(api.fetchAllMasterData).toHaveBeenCalledTimes(1);
  });
});
