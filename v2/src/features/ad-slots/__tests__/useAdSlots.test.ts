import { renderHook, act, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { useAdSlots } from '../hooks/useAdSlots';

const mockSelect = vi.fn();
const mockUpdate = vi.fn();
const mockEq = vi.fn();
const mockOrder = vi.fn();

vi.mock('@/lib/supabase', () => ({
  supabase: {
    from: vi.fn(() => ({
      select: mockSelect,
      update: mockUpdate,
    })),
  },
  TABLES: {
    adSlots: 'signage_ad_slots',
  },
}));

describe('useAdSlots', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    mockSelect.mockReturnValue({ order: mockOrder });
    mockOrder.mockResolvedValue({ data: [], error: null });
    mockUpdate.mockReturnValue({ eq: mockEq });
    mockEq.mockResolvedValue({ error: null });
  });

  it('fetches slots on mount', async () => {
    const mockSlots = [
      { id: 's1', slot_index: 1, image_url: null, caption: null, link_url: null, is_active: false },
    ];
    mockOrder.mockResolvedValue({ data: mockSlots, error: null });

    const { result } = renderHook(() => useAdSlots());

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.slots).toEqual(mockSlots);
  });

  it('keeps only slots 1-3 (login ads are 3 slots since v1.27.0)', async () => {
    const mockSlots = [1, 2, 3, 4, 7].map((i) => ({
      id: `s${i}`,
      slot_index: i,
      image_url: null,
      caption: null,
      link_url: null,
      is_active: false,
    }));
    mockOrder.mockResolvedValue({ data: mockSlots, error: null });

    const { result } = renderHook(() => useAdSlots());

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.slots.map((s) => s.slot_index)).toEqual([1, 2, 3]);
  });

  it('handles fetch error', async () => {
    mockOrder.mockResolvedValue({ data: null, error: { message: 'DB error' } });

    const { result } = renderHook(() => useAdSlots());

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.error).toBeTruthy();
  });

  it('updateSlot calls update with params', async () => {
    mockOrder.mockResolvedValue({ data: [], error: null });
    mockEq.mockImplementation(() => ({
      order: mockOrder,
    }));

    const { result } = renderHook(() => useAdSlots());

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    await act(async () => {
      await result.current.updateSlot('s1', { is_active: true });
    });

    expect(mockUpdate).toHaveBeenCalledWith({ is_active: true });
  });
});
