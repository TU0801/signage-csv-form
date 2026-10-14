import { renderHook, act, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { useSettings, toSettingValues } from '../hooks/useSettings';

const mockSelect = vi.fn();
const mockUpsert = vi.fn();
const mockUpsertSelect = vi.fn();

vi.mock('@/lib/supabase', () => ({
  supabase: {
    from: vi.fn(() => ({
      select: mockSelect,
      upsert: mockUpsert,
    })),
  },
  TABLES: {
    settings: 'signage_master_settings',
  },
}));

/** signage_master_settings の実列（本番の5行と同じ形。display_time_default は description が null） */
const row = (setting_key: string, setting_value: string, description: string | null = null) => ({
  id: `id-${setting_key}`,
  setting_key,
  setting_value,
  description,
  created_at: null,
  updated_at: null,
});

describe('useSettings', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSelect.mockResolvedValue({ data: [], error: null });
    mockUpsert.mockReturnValue({ select: mockUpsertSelect });
    mockUpsertSelect.mockResolvedValue({ data: [], error: null });
  });

  it('shows stored values and falls back to the v1 defaults for missing keys', async () => {
    mockSelect.mockResolvedValue({
      data: [row('display_time_default', '10'), row('display_time_max', '30', '表示時間の上限（秒）')],
      error: null,
    });

    const { result } = renderHook(() => useSettings());
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.values).toEqual({
      display_time_max: '30',
      display_time_default: '10',
      remarks_chars_per_line: '25',
      remarks_max_lines: '5',
      notice_text_max_chars: '200',
    });
  });

  it('toSettingValues ignores keys that are not on the v1 form', () => {
    expect(toSettingValues([row('app_name', 'x')])).not.toHaveProperty('app_name');
  });

  it('handles fetch error', async () => {
    mockSelect.mockResolvedValue({ data: null, error: { message: 'Fetch failed' } });
    const { result } = renderHook(() => useSettings());
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.error).toBeTruthy();
  });

  it('saveSettings upserts all five keys as text by setting_key', async () => {
    const { result } = renderHook(() => useSettings());
    await waitFor(() => expect(result.current.loading).toBe(false));

    const next = {
      display_time_max: '30',
      display_time_default: '8',
      remarks_chars_per_line: '25',
      remarks_max_lines: '5',
      notice_text_max_chars: '200',
    };
    await act(async () => {
      await result.current.saveSettings(next);
    });

    const [rows, options] = mockUpsert.mock.calls[0] as [{ updated_at: string }[], unknown];
    expect(options).toEqual({ onConflict: 'setting_key' });
    expect(rows).toHaveLength(5);
    expect(rows).toContainEqual(
      expect.objectContaining({ setting_key: 'display_time_default', setting_value: '8' }),
    );
    expect(rows.every((r: { updated_at: string }) => typeof r.updated_at === 'string')).toBe(true);
    expect(result.current.values.display_time_default).toBe('8');
  });

  it('saveSettings throws on error and keeps the previous values', async () => {
    mockUpsertSelect.mockResolvedValue({ data: null, error: { message: 'denied' } });
    const { result } = renderHook(() => useSettings());
    await waitFor(() => expect(result.current.loading).toBe(false));

    await expect(
      result.current.saveSettings({ ...result.current.values, display_time_default: '9' }),
    ).rejects.toMatchObject({ message: 'denied' });
    expect(result.current.values.display_time_default).toBe('6');
  });
});
