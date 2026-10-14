import { useState, useEffect, useCallback, useRef } from 'react';
import { fetchApprovedEntries } from '@/lib/api/admin-entries';
import type { DbEntry } from '@/types/database';
import { useAdminCountsStore } from '@/stores/adminCountsStore';
import type { EntriesFilters } from './useEntriesFilters';

/** データ一覧（承認済みのみ）を絞り込みに合わせて取得する */
// v1: js/admin-entries.js loadEntries
export function useEntriesTable(filters: EntriesFilters) {
  const [entries, setEntries] = useState<DbEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // 絞り込みを続けて変えたとき、古い応答があとに届いても反映しない（最新の依頼の番号だけを受け付ける）
  const requestSeq = useRef(0);

  const fetchEntries = useCallback(async () => {
    const seq = ++requestSeq.current;
    setLoading(true);
    setError(null);
    try {
      const rows = await fetchApprovedEntries({
        propertyCode: filters.propertyCode,
        startDate: filters.startDate,
        endDate: filters.endDate,
        vendorName: filters.vendorName,
      });
      if (seq === requestSeq.current) {
        setEntries(rows);
        // v1: js/admin-entries.js loadEntries → updateSidebarCounts
        useAdminCountsStore.getState().setApproved(rows.length);
      }
    } catch (err) {
      if (seq !== requestSeq.current) return;
      console.error('Failed to load entries:', err);
      setError('データの取得に失敗しました');
    } finally {
      if (seq === requestSeq.current) setLoading(false);
    }
  }, [filters.propertyCode, filters.startDate, filters.endDate, filters.vendorName]);

  useEffect(() => {
    fetchEntries();
  }, [fetchEntries]);

  return { entries, loading, error, refetch: fetchEntries };
}
