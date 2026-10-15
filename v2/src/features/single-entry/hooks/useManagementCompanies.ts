import { useEffect, useState } from 'react';
import { fetchPropertyManagementCompanies } from '@/lib/api/masterData';
import { buildManagementCompanyIndex, type ManagementCompanyIndex } from '../lib/entryLogic';

/**
 * 管理会社フィルター用に物件ごとの管理会社を読む（管理者だけ。RPC も管理者にしか行を返さない）。
 * 読めなかったときは null のまま（フィルターを出さず、物件は全件のまま入力できる）。
 */
export function useManagementCompanies(isAdmin: boolean): ManagementCompanyIndex | null {
  const [index, setIndex] = useState<ManagementCompanyIndex | null>(null);

  useEffect(() => {
    if (!isAdmin) return;
    let cancelled = false;
    fetchPropertyManagementCompanies()
      .then((rows) => {
        if (!cancelled) setIndex(buildManagementCompanyIndex(rows));
      })
      .catch((e: unknown) => console.error('物件の管理会社の取得に失敗しました:', e));
    return () => {
      cancelled = true;
    };
  }, [isAdmin]);

  return isAdmin ? index : null;
}
