import { renderHook, act, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { useUsers } from '../hooks/useUsers';

const mockSelect = vi.fn();
const mockInsert = vi.fn();
const mockDelete = vi.fn();
const mockUpdate = vi.fn();
const mockEq = vi.fn();
const mockOrder = vi.fn();

vi.mock('@/lib/supabase', () => ({
  supabase: {
    from: vi.fn(() => ({
      select: mockSelect,
      insert: mockInsert,
      delete: mockDelete,
      update: mockUpdate,
    })),
  },
  TABLES: {
    profiles: 'signage_profiles',
  },
}));

describe('useUsers', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    mockSelect.mockReturnValue({ order: mockOrder });
    mockOrder.mockResolvedValue({ data: [], error: null });
    mockInsert.mockResolvedValue({ error: null });
    mockDelete.mockReturnValue({ eq: mockEq });
    mockUpdate.mockReturnValue({ eq: mockEq });
    mockEq.mockImplementation(() => ({
      order: mockOrder,
      eq: mockEq,
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

  it('addUser calls insert and refetches', async () => {
    const { result } = renderHook(() => useUsers());

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    await act(async () => {
      await result.current.addUser({
        id: 'u2',
        email: 'new@test.com',
        role: 'user',
        vendor_id: 'v1',
      });
    });

    expect(mockInsert).toHaveBeenCalledWith({
      id: 'u2',
      email: 'new@test.com',
      role: 'user',
      vendor_id: 'v1',
    });
  });

  it('updateUser calls update with params', async () => {
    mockEq.mockImplementation(() => ({
      order: mockOrder,
      eq: mockEq,
    }));

    const { result } = renderHook(() => useUsers());

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    await act(async () => {
      await result.current.updateUser('u1', { role: 'admin' });
    });

    expect(mockUpdate).toHaveBeenCalledWith({ role: 'admin' });
  });

  it('deleteUser calls delete and refetches', async () => {
    mockEq.mockImplementation(() => ({
      order: mockOrder,
      eq: mockEq,
    }));

    const { result } = renderHook(() => useUsers());

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    await act(async () => {
      await result.current.deleteUser('u1');
    });

    expect(mockDelete).toHaveBeenCalled();
  });
});
