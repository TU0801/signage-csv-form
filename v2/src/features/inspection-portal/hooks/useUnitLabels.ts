import { useEffect, useState } from 'react';
import { fetchPortalInspectionUnits } from '@/lib/api/portal';
import { buildUnitIndex, unitLabelsById } from '../lib/units';

/**
 * 台 ID → No の表示（承認画面で台ごとの申請の台を出す。修正依頼1026 I7）。範囲は portal_inspection_units（管理者は全件・
 * 管理会社は自社物件）。enabled が false の間（台ごとの申請が無い間）は読まない。読めなければ空（No を出さないだけ）
 */
export function useUnitLabels(enabled: boolean): ReadonlyMap<string, string> {
  const [labels, setLabels] = useState<ReadonlyMap<string, string>>(() => new Map());
  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    fetchPortalInspectionUnits()
      .then((rows) => {
        if (!cancelled) setLabels(unitLabelsById(buildUnitIndex(rows)));
      })
      .catch((err: unknown) => console.error('号機の取得に失敗しました:', err));
    return () => {
      cancelled = true;
    };
  }, [enabled]);
  return labels;
}
