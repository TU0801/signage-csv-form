import { useEffect, useState } from 'react';
import { fetchUploadIssuerNames, fetchUploadPropertyAliases, fetchUploadVendorAliases } from '@/lib/api/property-files';
import { fetchManagementCompanyShortNames } from '@/lib/api/portal';
import type { CompanyAlias, PropertyAlias } from '../lib/fileNameExtract';
import { ownCompanyIdsOf } from '../lib/aiOcr';

export interface UploadNameHints {
  properties: PropertyAlias[];
  vendors: CompanyAlias[];
  managementCompanies: CompanyAlias[];
  /**
   * 自社（業務システムの発行元と同じ会社）の保守会社 id。読み取りの候補から外す（手で選ぶ候補には残す。修正依頼1104 E1）。
   * 読めなければ空（自社を外さないだけ）
   */
  ownVendorIds: string[];
}

const EMPTY: UploadNameHints = { properties: [], vendors: [], managementCompanies: [], ownVendorIds: [] };

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
      orEmpty(fetchUploadIssuerNames, '自社の名前'),
    ]).then(([properties, vendors, mgmt, issuers]) => {
      if (cancelled) return;
      setHints({
        properties,
        vendors,
        managementCompanies: mgmt.map((m) => ({ id: m.id, name: m.name, shortName: m.short_name })),
        ownVendorIds: ownCompanyIdsOf(issuers, vendors),
      });
    });
    return () => {
      cancelled = true;
    };
  }, []);
  return hints;
}
