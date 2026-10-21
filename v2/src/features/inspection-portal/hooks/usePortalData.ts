import { useCallback, useEffect, useRef, useState } from 'react';
import { entryErrorReason } from '@/lib/api/admin-entries';
import { fetchInspectionReports, fetchPortalEntries, fetchPortalInspections } from '@/lib/api/portal';
import type { DbInspectionReport, PortalEntryRow, PortalInspectionRow } from '@/types/portal';

export interface PortalData {
  inspections: PortalInspectionRow[];
  entries: PortalEntryRow[];
  reports: DbInspectionReport[];
}

const EMPTY: PortalData = { inspections: [], entries: [], reports: [] };

/**
 * 点検一覧の元データ（点検行・申請・報告書）を並べて読む。範囲は DB 側（RPC・RLS）が絞る。
 * 読み直し中は前のデータを出したままにする（表が一瞬空になって位置が飛ばないように）
 */
export function usePortalData() {
  const [data, setData] = useState<PortalData>(EMPTY);
  const [loading, setLoading] = useState(true);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // 古い読み込みの結果で新しい結果を上書きしない
  const seq = useRef(0);

  const refetch = useCallback(async () => {
    const mine = ++seq.current;
    setLoading(true);
    try {
      const [inspections, entries, reports] = await Promise.all([
        fetchPortalInspections(),
        fetchPortalEntries(),
        fetchInspectionReports(),
      ]);
      if (mine !== seq.current) return;
      setData({ inspections, entries, reports });
      setError(null);
      setLoaded(true);
    } catch (err) {
      if (mine !== seq.current) return;
      console.error('Portal load failed:', err);
      // Supabase のエラーは Error のインスタンスではない（PostgrestError）ので、message を日本語の理由に直して出す
      setError(entryErrorReason(err) || '原因が分かりませんでした');
    } finally {
      if (mine === seq.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refetch();
  }, [refetch]);

  return { ...data, loading, loaded, error, refetch };
}
