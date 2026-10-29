import { useEffect, useRef, useState } from 'react';
import { fetchPortalInspectionUnits, fetchPortalInspections } from '@/lib/api/portal';
import type { PortalInspectionRow, PortalUnitRow } from '@/types/portal';

/** 承認待ちの編集で点検種別を選び直す範囲（申請の保守会社がその物件で担当する点検行と台。修正依頼1029） */
export interface InspectionScope {
  inspections: PortalInspectionRow[];
  units: PortalUnitRow[];
}

/**
 * 点検行と台を、enabled になったとき（編集を初めて開いたとき）に1回だけ読む。管理者は portal_inspections が全部の点検行を返す。
 * 読めなかったときは空（点検種別は変えられない＝申請のまま）
 */
export function useInspectionScope(enabled: boolean): InspectionScope | null {
  const [scope, setScope] = useState<InspectionScope | null>(null);
  const started = useRef(false);
  useEffect(() => {
    if (!enabled || started.current) return;
    started.current = true;
    Promise.all([fetchPortalInspections(), fetchPortalInspectionUnits()])
      .then(([inspections, units]) => setScope({ inspections, units }))
      .catch((err) => {
        console.error('Failed to load inspection scope:', err);
        setScope({ inspections: [], units: [] });
      });
  }, [enabled]);
  return scope;
}
