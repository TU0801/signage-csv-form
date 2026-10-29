import { useEffect, useState } from 'react';
import { fetchUploadPropertyAliases, fetchUploadVendorAliases } from '@/lib/api/property-files';
import { fetchManagementCompanyShortNames } from '@/lib/api/portal';
import type { CompanyAlias, PropertyAlias } from '../lib/fileNameExtract';

export interface UploadNameHints {
  properties: PropertyAlias[];
  vendors: CompanyAlias[];
  managementCompanies: CompanyAlias[];
}

const EMPTY: UploadNameHints = { properties: [], vendors: [], managementCompanies: [] };

/** 読めなかったときは空（ファイル名からの自動入力が効かないだけで、手で選べる） */
function orEmpty<T>(load: () => Promise<T[]>, what: string): Promise<T[]> {
  try {
    return load().catch((err: unknown) => {
      console.warn(`${what}の取得に失敗しました:`, err);
      return [];
    });
  } catch (err) {
    console.warn(`${what}の取得に失敗しました:`, err);
    return Promise.resolve([]);
  }
}

/**
 * ファイル名からの自動入力（修正依頼1029(1)）に使う名前の一覧。物件は signage の物件コード・名前と業務システムの物件名・略称、
 * 取引先は業務システムの取引先名・略称（保守会社・管理会社）。開いたときに1回読む
 */
export function useUploadNameHints(): UploadNameHints {
  const [hints, setHints] = useState<UploadNameHints>(EMPTY);
  useEffect(() => {
    let cancelled = false;
    void Promise.all([
      orEmpty(fetchUploadPropertyAliases, '物件の名前'),
      orEmpty(fetchUploadVendorAliases, '保守会社の名前'),
      orEmpty(fetchManagementCompanyShortNames, '管理会社の名前'),
    ]).then(([properties, vendors, mgmt]) => {
      if (cancelled) return;
      setHints({
        properties,
        vendors,
        managementCompanies: mgmt.map((m) => ({ id: m.id, name: m.name, shortName: m.short_name })),
      });
    });
    return () => {
      cancelled = true;
    };
  }, []);
  return hints;
}
