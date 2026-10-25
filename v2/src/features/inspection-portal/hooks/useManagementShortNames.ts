import { useEffect, useState } from 'react';
import { fetchManagementCompanyShortNames } from '@/lib/api/portal';

/**
 * 管理会社 ID → 表に出す名前（略称。未登録なら正式名）。修正依頼1025 F5。
 * 読めなければ空（呼ぶ側は今までどおり正式名を出す）
 */
export function useManagementShortNames(): ReadonlyMap<string, string> {
  const [names, setNames] = useState<ReadonlyMap<string, string>>(() => new Map());
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const rows = await fetchManagementCompanyShortNames();
        if (!cancelled) setNames(new Map(rows.map((r) => [r.id, r.short_name || r.name])));
      } catch (err) {
        console.error('管理会社の略称の取得に失敗しました（正式名を出します）:', err);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);
  return names;
}
