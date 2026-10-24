import { useEffect, useState } from 'react';
import { fetchScopedManagementCompanies } from '@/lib/api/inspection-form';
import { buildManagementCompanyIndex, type ManagementCompanyIndex } from '../lib/entryLogic';

/**
 * 管理会社フィルター用に物件ごとの管理会社を読む（管理者は全物件、保守会社は担当物件と担当の点検の物件。修正依頼1024 B2）。
 * enabled が false（管理会社のアカウント）のときは読まない。読めなかったときは null のまま（フィルターを出さず、物件は全件のまま入力できる）。
 */
export function useManagementCompanies(enabled: boolean): ManagementCompanyIndex | null {
  const [index, setIndex] = useState<ManagementCompanyIndex | null>(null);

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    fetchScopedManagementCompanies()
      .then((rows) => {
        if (!cancelled) setIndex(buildManagementCompanyIndex(rows));
      })
      .catch((e: unknown) => console.error('物件の管理会社の取得に失敗しました:', e));
    return () => {
      cancelled = true;
    };
  }, [enabled]);

  return enabled ? index : null;
}
