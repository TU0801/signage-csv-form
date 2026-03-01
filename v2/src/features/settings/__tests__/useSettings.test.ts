import { renderHook, act, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { useSettings } from '../hooks/useSettings';

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
    settings: 'signage_master_settings',
  },
}));

describe('useSettings', () => {
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

  it('fetches settings on mount', async () => {
    const mockSettings = [
      { id: 's1', setting_key: 'app_name', setting_value: 'Test', description: null },
    ];
    mockOrder.mockResolvedValue({ data: mockSettings, error: null });

    const { result } = renderHook(() => useSettings());

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.settings).toEqual(mockSettings);
    expect(result.current.error).toBeNull();
  });

  it('handles fetch error', async () => {
    mockOrder.mockResolvedValue({ data: null, error: { message: 'Network error' } });

    const { result } = renderHook(() => useSettings());

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.error).toBeTruthy();
  });

  it('updateSetting calls update with value', async () => {
    mockEq.mockImplementation(() => ({
      order: mockOrder,
      eq: mockEq,
    }));

    const { result } = renderHook(() => useSettings());

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    await act(async () => {
      await result.current.updateSetting('s1', 'NewValue');
    });

    expect(mockUpdate).toHaveBeenCalledWith({ setting_value: 'NewValue' });
  });

  it('addSetting calls insert', async () => {
    const { result } = renderHook(() => useSettings());

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    await act(async () => {
      await result.current.addSetting('new_key', 'new_value', 'A description');
    });

    expect(mockInsert).toHaveBeenCalledWith({
      setting_key: 'new_key',
      setting_value: 'new_value',
      description: 'A description',
    });
  });

  it('deleteSetting calls delete', async () => {
    mockEq.mockImplementation(() => ({
      order: mockOrder,
      eq: mockEq,
    }));

    const { result } = renderHook(() => useSettings());

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    await act(async () => {
      await result.current.deleteSetting('s1');
    });

    expect(mockDelete).toHaveBeenCalled();
  });
});
