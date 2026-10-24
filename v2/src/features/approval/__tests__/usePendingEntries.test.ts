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
const portal = vi.hoisted(() => ({ reviewEntry: vi.fn() }));
vi.mock('@/lib/api/portal', () => portal);
// 権限は profile.role だけを見る（管理会社のときは portal_review_entry で承認・差戻し）
const auth = vi.hoisted(() => ({ state: { profile: null as { role: string } | null } }));
vi.mock('@/stores/authStore', () => ({
  useAuthStore: (sel: (s: typeof auth.state) => unknown) => sel(auth.state),
}));

const draft = (id: string) => ({ id, status: 'draft' }) as DbEntry;

beforeEach(() => {
  vi.clearAllMocks();
  auth.state.profile = null;
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

  it('bulk reject waits for every delete before reloading and reports how many succeeded and failed', async () => {
    api.fetchPendingEntries.mockResolvedValue([]);
    // 1件目はすぐ失敗し、2件目はあとから終わる（失敗した時点で読み直さないこと）
    let finishSecond: () => void = () => {};
    api.rejectEntry
      .mockRejectedValueOnce(new Error('denied'))
      .mockImplementationOnce(() => new Promise<void>((resolve) => (finishSecond = resolve)));
    const { result } = renderHook(() => usePendingEntries());

    let outcome: Awaited<ReturnType<typeof result.current.rejectBulk>> | undefined;
    await act(async () => {
      const p = result.current.rejectBulk(['1', '2']);
      await Promise.resolve();
      expect(api.fetchPendingEntries).not.toHaveBeenCalled();
      finishSecond();
      outcome = await p;
    });
    expect(api.rejectEntry).toHaveBeenCalledWith('1');
    expect(api.rejectEntry).toHaveBeenCalledWith('2');
    expect(api.fetchPendingEntries).toHaveBeenCalledTimes(1);
    expect(outcome).toEqual({ succeeded: 1, failed: 1, firstError: new Error('denied') });
  });
});

describe('usePendingEntries（管理会社: 修正依頼1024 C2）', () => {
  it('管理会社の承認・一括承認・差戻しは portal_review_entry（reviewEntry）で行い、表を直接は更新しない', async () => {
    auth.state.profile = { role: 'management' };
    api.fetchPendingEntries.mockResolvedValue([]);
    portal.reviewEntry.mockResolvedValue({ id: '1', status: 'ready' });
    const { result } = renderHook(() => usePendingEntries());

    await act(() => result.current.approveEntry('1'));
    await act(() => result.current.approveBulk(['2', '3']));
    await act(() => result.current.sendBackEntry('4', '日付が違います'));

    expect(portal.reviewEntry.mock.calls).toEqual([
      ['1', 'approve'],
      ['2', 'approve'],
      ['3', 'approve'],
      ['4', 'send_back', '日付が違います'],
    ]);
    expect(api.approveEntry).not.toHaveBeenCalled();
    expect(api.approveEntries).not.toHaveBeenCalled();
  });
});
