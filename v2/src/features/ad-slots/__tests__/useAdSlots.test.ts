import { renderHook, act, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { useAdSlots } from '../hooks/useAdSlots';

const mockSelect = vi.fn();
const mockInsert = vi.fn();
const mockUpdate = vi.fn();
const mockEq = vi.fn();
const mockOrder = vi.fn();

vi.mock('@/lib/supabase', () => ({
  supabase: {
    from: vi.fn(() => ({
      select: mockSelect,
      insert: mockInsert,
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
    mockInsert.mockResolvedValue({ error: null });
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

  it('handles fetch error', async () => {
    mockOrder.mockResolvedValue({ data: null, error: { message: 'DB error' } });

    const { result } = renderHook(() => useAdSlots());

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.error).toBeTruthy();
  });

  it('ensureSlots inserts missing slots', async () => {
    // First call for fetchSlots (order), second for ensureSlots (select without order)
    mockSelect.mockImplementation(() => ({
      order: mockOrder,
    }));
    mockOrder.mockResolvedValue({ data: [], error: null });

    const { result } = renderHook(() => useAdSlots());

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    // Override for ensureSlots: select returns only slot_index, no order
    mockSelect.mockReturnValueOnce(
      Promise.resolve({ data: [{ slot_index: 1 }, { slot_index: 2 }], error: null }),
    );
    mockOrder.mockResolvedValue({ data: [], error: null });

    await act(async () => {
      await result.current.ensureSlots();
    });

    // Should insert 5 missing slots (3-7)
    expect(mockInsert).toHaveBeenCalled();
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
