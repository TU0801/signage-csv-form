import { useState, useCallback } from 'react';
import {
  approveEntries,
  approveEntry as apiApproveEntry,
  fetchPendingEntries as apiFetchPendingEntries,
  rejectEntry as apiRejectEntry,
} from '@/lib/api/admin-entries';
import { reviewEntry } from '@/lib/api/portal';
import { useAuthStore } from '@/stores/authStore';
import type { DbEntry } from '@/types/database';
import { applyDefaultStartDate } from '@/features/entries-list/hooks/useEntriesFilters';
import { useAdminCountsStore } from '@/stores/adminCountsStore';

/**
 * 承認待ち（申請済み = draft）のエントリ。承認・却下・一括承認のあとは一覧を読み直す。
 * 管理会社は自社物件の申請だけが読め（RLS）、承認・差戻しは portal_review_entry（範囲を DB が確かめる）で行う。
 * 管理会社は却下（削除）できない（guard_entry_management_delete）
 */
// v1: js/admin-pending.js
export function usePendingEntries() {
  const isManagement = useAuthStore((s) => s.profile?.role === 'management');
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
      if (isManagement) await reviewEntry(id, 'approve');
      else await apiApproveEntry(id);
      // v1: js/admin-pending.js → js/admin.js loadAllData（データ一覧の開始日が空なら今日を入れる）
      applyDefaultStartDate();
      await fetchPendingEntries();
    },
    [fetchPendingEntries, isManagement],
  );

  // 差戻し（管理者・管理会社。理由を付けて未申請に戻す。点検一覧の差戻しと同じ RPC）
  const sendBackEntry = useCallback(
    async (id: string, reason: string) => {
      await reviewEntry(id, 'send_back', reason);
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
      if (isManagement) {
        // RPC は1件ずつ。全件の結果を待ってから読み直し、失敗があれば最初の理由で知らせる
        const results = await Promise.allSettled(ids.map((id) => reviewEntry(id, 'approve')));
        applyDefaultStartDate();
        await fetchPendingEntries();
        const failed = results.filter((r): r is PromiseRejectedResult => r.status === 'rejected');
        if (failed[0]) throw failed[0].reason;
        return;
      }
      await approveEntries(ids);
      // v1: js/admin-pending.js → js/admin.js loadAllData（データ一覧の開始日が空なら今日を入れる）
      applyDefaultStartDate();
      await fetchPendingEntries();
    },
    [fetchPendingEntries, isManagement],
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
    sendBackEntry,
  };
}
