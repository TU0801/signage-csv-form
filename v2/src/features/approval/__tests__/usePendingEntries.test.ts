import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { usePendingEntries } from '../hooks/usePendingEntries';
import type { DbEntry } from '@/types/database';
import {
  getSessionFiltersForTest,
  resetSessionFiltersForTest,
  todayForFilter,
} from '@/features/entries-list/hooks/useEntriesFilters';

const api = vi.hoisted(() => ({
  fetchPendingEntries: vi.fn(),
  approveEntry: vi.fn(),
  approveEntries: vi.fn(),
  rejectEntry: vi.fn(),
}));

vi.mock('@/lib/api/admin-entries', () => api);

const draft = (id: string) => ({ id, status: 'draft' }) as DbEntry;

beforeEach(() => {
  vi.clearAllMocks();
});

describe('usePendingEntries (v1 admin-pending.js)', () => {
  it('approves (status ready via API), reloads the draft list and sets the list start date to today', async () => {
    resetSessionFiltersForTest();
    api.fetchPendingEntries.mockResolvedValueOnce([draft('1'), draft('2')]).mockResolvedValueOnce([draft('2')]);
    api.approveEntry.mockResolvedValue({ id: '1', status: 'ready' });
    const { result } = renderHook(() => usePendingEntries());

    await act(() => result.current.fetchPendingEntries());
    expect(result.current.entries.map((e) => e.id)).toEqual(['1', '2']);

    await act(() => result.current.approveEntry('1'));
    expect(api.approveEntry).toHaveBeenCalledWith('1');
    expect(result.current.entries.map((e) => e.id)).toEqual(['2']);
    // v1: 承認のあと loadAllData が #filterStartDate（空なら）に今日を入れる
    expect(getSessionFiltersForTest()?.startDate).toBe(todayForFilter());
  });

  it('rejects by deleting and propagates the DB error so the screen can show it', async () => {
    api.fetchPendingEntries.mockResolvedValue([draft('1')]);
    api.rejectEntry.mockRejectedValue({ code: '42501', message: '承認済みのデータは削除できません（管理者にお問い合わせください）' });
    const { result } = renderHook(() => usePendingEntries());

    await expect(act(() => result.current.rejectEntry('1'))).rejects.toMatchObject({ code: '42501' });
    expect(api.rejectEntry).toHaveBeenCalledWith('1');
  });

  it('bulk approve sends the selected ids in one call and skips an empty selection', async () => {
    api.fetchPendingEntries.mockResolvedValue([]);
    api.approveEntries.mockResolvedValue([]);
    const { result } = renderHook(() => usePendingEntries());

    await act(() => result.current.approveBulk([]));
    expect(api.approveEntries).not.toHaveBeenCalled();
    await act(() => result.current.approveBulk(['1', '3']));
    expect(api.approveEntries).toHaveBeenCalledWith(['1', '3']);
    expect(api.fetchPendingEntries).toHaveBeenCalledTimes(1);
  });
});
