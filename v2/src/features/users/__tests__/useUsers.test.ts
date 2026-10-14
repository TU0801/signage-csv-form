import { renderHook, act, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { useUsers } from '../hooks/useUsers';

const mockSelect = vi.fn();
const mockUpdate = vi.fn();
const mockCreateUser = vi.fn();
const mockEq = vi.fn();
const mockOrder = vi.fn();
const mockSingle = vi.fn();

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

vi.mock('@/lib/api/users', () => ({
  createUser: (...args: unknown[]) => mockCreateUser(...args),
}));

describe('useUsers', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    mockSelect.mockReturnValue({ order: mockOrder });
    mockOrder.mockResolvedValue({ data: [], error: null });
    mockCreateUser.mockResolvedValue({ id: 'u2' });
    mockUpdate.mockReturnValue({ eq: mockEq });
    mockSingle.mockResolvedValue({ data: { id: 'u1' }, error: null });
    mockEq.mockImplementation(() => ({
      order: mockOrder,
      eq: mockEq,
      select: () => ({ single: mockSingle }),
    }));
  });

  it('fetches users on mount', async () => {
    const mockUsers = [
      { id: 'u1', email: 'test@test.com', role: 'admin', vendor_id: null },
    ];
    mockOrder.mockResolvedValue({ data: mockUsers, error: null });

    const { result } = renderHook(() => useUsers());

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.users).toEqual(mockUsers);
    expect(result.current.error).toBeNull();
  });

  it('handles fetch error', async () => {
    mockOrder.mockResolvedValue({ data: null, error: { message: 'Fetch failed' } });

    const { result } = renderHook(() => useUsers());

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.error).toBeTruthy();
  });

  it('addUser creates the account through the Edge Function (no direct profiles insert)', async () => {
    const { result } = renderHook(() => useUsers());

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

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
    });
  });

  it('updateUser calls update with params', async () => {
    const { result } = renderHook(() => useUsers());

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    await act(async () => {
      await result.current.updateUser('u1', { role: 'admin' });
    });

    expect(mockUpdate).toHaveBeenCalledWith({ role: 'admin' });
  });

  it('updateUser throws when RLS skips the UPDATE (0 rows)', async () => {
    mockSingle.mockResolvedValue({ data: null, error: { code: 'PGRST116', message: '0 rows' } });

    const { result } = renderHook(() => useUsers());

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    await expect(result.current.updateUser('u1', { status: 'inactive' })).rejects.toMatchObject({
      code: 'PGRST116',
    });
  });
});
