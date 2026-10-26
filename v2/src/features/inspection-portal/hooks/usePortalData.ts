import { useCallback, useEffect, useRef, useState } from 'react';
import { entryErrorReason } from '@/lib/api/admin-entries';
import {
  fetchInspectionReports,
  fetchInspectionTypeFlags,
  fetchNotifyOff,
  fetchPortalEntries,
  fetchPortalEntryUnits,
  fetchPortalInspections,
  fetchPortalInspectionUnits,
} from '@/lib/api/portal';
import { fetchCompletions, fetchInspectionDates } from '@/lib/api/inspection-form';
import type { DbInspectionCompletion, RpcInspectionDateRow } from '@/types/database';
import type {
  DbInspectionReport,
  InspectionTypeFlagRow,
  NotifyOffRow,
  PortalEntryRow,
  PortalInspectionRow,
  PortalUnitRow,
} from '@/types/portal';

export interface PortalData {
  inspections: PortalInspectionRow[];
  entries: PortalEntryRow[];
  reports: DbInspectionReport[];
  /** 完了連絡（修正依頼1024） */
  completions: DbInspectionCompletion[];
  /** 検査月（直近の実施年月）のある点検 */
  inspectionDates: RpcInspectionDateRow[];
  /** 号機（台）と設備会社固有コード（修正依頼1025 H1〜H3）。読めなければ空（台ごとに分けない） */
  units: PortalUnitRow[];
  /** 点検種別の印（申請不要・毎月。H4/G4）。読めなければ空（印なし） */
  typeFlags: InspectionTypeFlagRow[];
  /** 点検日連絡が OFF の点検行・台（修正依頼1026）。読めなければ空（全部 ON） */
  notifyOff: NotifyOffRow[];
}

const EMPTY: PortalData = {
  inspections: [],
  entries: [],
  reports: [],
  completions: [],
  inspectionDates: [],
  units: [],
  typeFlags: [],
  notifyOff: [],
};

/** 申請に台（portal_entry_units）を付ける（修正依頼1026 I7）。読めなければ台なしのまま */
export function withEntryUnits(entries: PortalEntryRow[], units: { entry_id: string; property_unit_id: string }[]): PortalEntryRow[] {
  if (units.length === 0) return entries;
  const byEntry = new Map(units.map((u) => [u.entry_id, u.property_unit_id]));
  return entries.map((e) => (byEntry.has(e.id) ? { ...e, property_unit_id: byEntry.get(e.id) } : e));
}

/** 完了連絡・検査月は補助の情報なので、読めなくても一覧は出す（空として続ける） */
function orEmpty<T>(p: Promise<T[]>, what: string): Promise<T[]> {
  return p.catch((err: unknown) => {
    console.error(`${what}の取得に失敗しました:`, err);
    return [];
  });
}

/** orEmpty と同じ。呼び出し自体が同期で失敗しても（関数が無い等）空として続ける */
function tryEmpty<T>(load: () => Promise<T[]>, what: string): Promise<T[]> {
  try {
    return orEmpty(load(), what);
  } catch (err) {
    console.error(`${what}の取得に失敗しました:`, err);
    return Promise.resolve([]);
  }
}

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
      const [inspections, rawEntries, reports, completions, inspectionDates, units, typeFlags, entryUnits, notifyOff] =
        await Promise.all([
          fetchPortalInspections(),
          fetchPortalEntries(),
          fetchInspectionReports(),
          orEmpty(fetchCompletions(), '完了連絡'),
          orEmpty(fetchInspectionDates(), '検査月'),
          tryEmpty(() => fetchPortalInspectionUnits(), '号機'),
          tryEmpty(() => fetchInspectionTypeFlags(), '点検種別の印'),
          // 読めなければ null（下で台ごとに分けるのをやめる）
          tryEmpty(() => fetchPortalEntryUnits().then((rows) => [rows]), '申請の台').then((r) => r[0] ?? null),
          tryEmpty(() => fetchNotifyOff(), '点検日連絡'),
        ]);
      if (mine !== seq.current) return;
      // 申請の台が読めないときは号機も空にする（台つきの申請が台なしに見え、全部の台が申請済みに見えるのを避ける。
      // 台ごとに分けずに点検行 × 対象月の行で出す）
      const entries = withEntryUnits(rawEntries, entryUnits ?? []);
      setData({
        inspections,
        entries,
        reports,
        completions,
        inspectionDates,
        units: entryUnits ? units : [],
        typeFlags,
        notifyOff,
      });
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
