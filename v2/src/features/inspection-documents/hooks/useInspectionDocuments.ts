import { useCallback, useEffect, useState } from 'react';
import type { DbInspectionReport, PortalInspectionRow } from '@/types/portal';
import { fetchInspectionReports, fetchPortalInspections } from '@/lib/api/portal';

/**
 * 報告書（RLS で範囲内だけ）と点検（再提出のモーダルに渡す行）を読む。
 * 管理会社はマスタを読めないので、点検は portal_inspections の RPC から引く
 */
export function useInspectionDocuments(onError: (err: unknown) => void) {
  const [reports, setReports] = useState<DbInspectionReport[]>([]);
  const [inspections, setInspections] = useState<PortalInspectionRow[]>([]);
  const [loading, setLoading] = useState(true);

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      // 点検は再提出のときにしか使わないので、点検の読み込みに失敗しても報告書の一覧は出す
      const [r, i] = await Promise.allSettled([fetchInspectionReports(), fetchPortalInspections()]);
      if (i.status === 'fulfilled') setInspections(i.value);
      if (r.status === 'rejected') throw r.reason;
      setReports(r.value);
      if (i.status === 'rejected') throw i.reason;
    } catch (err) {
      onError(err);
    } finally {
      setLoading(false);
    }
  }, [onError]);

  useEffect(() => {
    void reload();
  }, [reload]);

  /** RPC が返した1行で差し替える（再読み込みせずに表を更新する） */
  const replaceReport = useCallback((updated: DbInspectionReport) => {
    setReports((prev) => prev.map((r) => (r.id === updated.id ? updated : r)));
  }, []);

  return { reports, inspections, loading, reload, replaceReport };
}
