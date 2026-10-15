import { useState, useCallback } from 'react';
import {
  approveEntries,
  approveEntry as apiApproveEntry,
  fetchPendingEntries as apiFetchPendingEntries,
  rejectEntry as apiRejectEntry,
} from '@/lib/api/admin-entries';
import type { DbEntry } from '@/types/database';
import { applyDefaultStartDate } from '@/features/entries-list/hooks/useEntriesFilters';
import { useAdminCountsStore } from '@/stores/adminCountsStore';

/** 承認待ち（申請済み = draft）のエントリ。承認・却下・一括承認のあとは一覧を読み直す */
// v1: js/admin-pending.js
export function usePendingEntries() {
  const [entries, setEntries] = useState<DbEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // v1: js/admin-pending.js loadPendingEntries
  const fetchPendingEntries = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const rows = await apiFetchPendingEntries();
      setEntries(rows);
      // v1: js/admin-pending.js → updateSidebarCounts
      useAdminCountsStore.getState().setPendingEntries(rows.length);
    } catch (err) {
      console.error('Failed to load pending entries:', err);
      setError('承認待ちデータの取得に失敗しました');
    } finally {
      setLoading(false);
    }
  }, []);

  // v1: js/admin-pending.js approveSingle
  const approveEntry = useCallback(
    async (id: string) => {
      await apiApproveEntry(id);
      // v1: js/admin-pending.js → js/admin.js loadAllData（データ一覧の開始日が空なら今日を入れる）
      applyDefaultStartDate();
      await fetchPendingEntries();
    },
    [fetchPendingEntries],
  );

  // v1: js/admin-pending.js rejectSingle（却下 = 削除）
  const rejectEntry = useCallback(
    async (id: string) => {
      await apiRejectEntry(id);
      // v1: js/admin-pending.js → js/admin.js loadAllData（データ一覧の開始日が空なら今日を入れる）
      applyDefaultStartDate();
      await fetchPendingEntries();
    },
    [fetchPendingEntries],
  );

  // v1: js/admin-pending.js approveSelected
  const approveBulk = useCallback(
    async (ids: string[]) => {
      if (ids.length === 0) return;
      await approveEntries(ids);
      // v1: js/admin-pending.js → js/admin.js loadAllData（データ一覧の開始日が空なら今日を入れる）
      applyDefaultStartDate();
      await fetchPendingEntries();
    },
    [fetchPendingEntries],
  );

  // 選択した行をまとめて却下（1件ずつの却下と同じく削除）。却下は取り消せないので、全件の結果が出てから読み直し、
  // 成功・失敗の件数を返す（途中で1件失敗しても、ほかの削除が済んだかどうかを伝えるため）
  const rejectBulk = useCallback(
    async (ids: string[]): Promise<{ succeeded: number; failed: number; firstError: unknown }> => {
      if (ids.length === 0) return { succeeded: 0, failed: 0, firstError: null };
      const results = await Promise.allSettled(ids.map((id) => apiRejectEntry(id)));
      applyDefaultStartDate();
      await fetchPendingEntries();
      const failures = results.filter((r): r is PromiseRejectedResult => r.status === 'rejected');
      return {
        succeeded: results.length - failures.length,
        failed: failures.length,
        firstError: failures[0]?.reason ?? null,
      };
    },
    [fetchPendingEntries],
  );

  return {
    entries,
    loading,
    error,
    fetchPendingEntries,
    approveEntry,
    rejectEntry,
    approveBulk,
    rejectBulk,
  };
}
