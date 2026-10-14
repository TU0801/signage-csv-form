import { useCallback, useEffect, useState } from 'react';
import { fetchMyEntriesThisMonth } from '@/lib/api/single-entry';
import type { DbEntry } from '@/types/database';

/** 自分が今月登録したエントリー（申請済み一覧） */
// v1: js/script.js renderDataList（getUserEntriesCurrentMonth）
export function useSubmittedEntries(userId: string | null) {
  const [entries, setEntries] = useState<DbEntry[]>([]);
  const [version, setVersion] = useState(0);

  useEffect(() => {
    if (!userId) return;
    let cancelled = false;
    fetchMyEntriesThisMonth(userId).then((rows) => {
      if (!cancelled) setEntries(rows);
    });
    return () => {
      cancelled = true;
    };
  }, [userId, version]);

  const refetch = useCallback(() => setVersion((v) => v + 1), []);

  return { entries, refetch };
}
