import { useEffect, useState } from 'react';
import { fetchEntryVendorDefaults } from '@/lib/api/vendor-overrides';
import { buildVendorDefaultsIndex, type VendorDefaultsIndex } from '@/lib/vendorDefaults';

/**
 * 申請画面の初期値に使う、管理会社ごとの保守会社の上書き（修正依頼1115 (5)）。画面を開いたときに1回だけ読む。
 * 読めなければ null（既定のまま入力できる）
 */
export function useEntryVendorDefaults(): VendorDefaultsIndex | null {
  const [index, setIndex] = useState<VendorDefaultsIndex | null>(null);
  useEffect(() => {
    let cancelled = false;
    fetchEntryVendorDefaults()
      .then((payload) => {
        if (!cancelled) setIndex(buildVendorDefaultsIndex(payload));
      })
      .catch((e: unknown) => console.warn('管理会社の個別設定（緊急連絡先・点検TPL）の取得に失敗しました（既定で入力します）:', e));
    return () => {
      cancelled = true;
    };
  }, []);
  return index;
}
