import { useCallback, useEffect, useState } from 'react';
import type { DbInspectionReport, DbPropertyFile, PortalInspectionRow } from '@/types/portal';
import { fetchInspectionReports, fetchPortalInspections } from '@/lib/api/portal';
import { fetchPropertyFiles } from '@/lib/api/property-files';

// 点検は再提出のときにしか使わないので、点検の読み込みに失敗しても報告書の一覧は出す（allSettled で別々に受ける）。
// その他ファイル（修正依頼1025 G2）も別に受ける（表がまだ無い環境・読めないときも報告書は出す）
function fetchBoth() {
  return Promise.allSettled([fetchInspectionReports(), fetchPortalInspections(), fetchPropertyFiles()]);
}

/**
 * 報告書（RLS で範囲内だけ）と点検（再提出のモーダルに渡す行）を読む。
 * 管理会社はマスタを読めないので、点検は portal_inspections の RPC から引く。
 * 失敗はトーストでなく状態で返す（表の場所に出して「0件」と見分けられるようにする。
 * 開発時の StrictMode で effect が2回走ってもトーストが重ならない）
 */
export function useInspectionDocuments() {
  const [reports, setReports] = useState<DbInspectionReport[]>([]);
  const [inspections, setInspections] = useState<PortalInspectionRow[]>([]);
  const [loading, setLoading] = useState(true);
  /** 報告書の一覧を読めなかった理由（読めたら null） */
  const [error, setError] = useState<unknown>(null);
  /** 点検を読めなかった（一覧は出せるが再提出ができない） */
  const [inspectionsError, setInspectionsError] = useState<unknown>(null);
  const [files, setFiles] = useState<DbPropertyFile[]>([]);
  /** その他ファイルを読めなかった理由（読めたら null） */
  const [filesError, setFilesError] = useState<unknown>(null);

  const apply = useCallback(([r, i, f]: Awaited<ReturnType<typeof fetchBoth>>) => {
    if (f.status === 'fulfilled') {
      setFiles(f.value);
      setFilesError(null);
    } else {
      setFilesError(f.reason);
    }
    if (i.status === 'fulfilled') {
      setInspections(i.value);
      setInspectionsError(null);
    } else {
      setInspectionsError(i.reason);
    }
    if (r.status === 'fulfilled') {
      setReports(r.value);
      setError(null);
    } else {
      setError(r.reason);
    }
    setLoading(false);
  }, []);

  const reload = useCallback(async () => {
    setLoading(true);
    apply(await fetchBoth());
  }, [apply]);

  // 最初は loading=true で始まる。結果は then の中で反映する（effect の中で同期的に state を変えない）
  useEffect(() => {
    void fetchBoth().then(apply);
  }, [apply]);

  /** RPC が返した1行で差し替える（再読み込みせずに表を更新する） */
  const replaceReport = useCallback((updated: DbInspectionReport) => {
    setReports((prev) => prev.map((r) => (r.id === updated.id ? updated : r)));
  }, []);

  /** RPC が返した1行で差し替える（その他ファイル） */
  const replaceFile = useCallback((updated: DbPropertyFile) => {
    setFiles((prev) => prev.map((f) => (f.id === updated.id ? updated : f)));
  }, []);

  return { reports, inspections, files, loading, error, inspectionsError, filesError, reload, replaceReport, replaceFile };
}
