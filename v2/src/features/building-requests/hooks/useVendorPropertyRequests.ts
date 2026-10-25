import { useCallback, useEffect, useMemo, useState } from 'react';
import { fetchVendorPropertyRequests } from '@/lib/api/property-requests';
import type { DbPropertyRequest } from '@/types/database';

/**
 * 保守会社の建物追加の申請（1件入力で未承認の建物を物件の候補に出すため。修正依頼1025 D4・F2）。
 * 読めなくても入力はできる（未承認の建物が候補に出ないだけ）。保守会社を切り替えた直後は前の保守会社の申請を使わない
 */
export function useVendorPropertyRequests(vendorId: string | null) {
  const [requests, setRequests] = useState<DbPropertyRequest[]>([]);
  const [loadedFor, setLoadedFor] = useState<string | null>(null);

  useEffect(() => {
    if (!vendorId) return;
    let cancelled = false;
    fetchVendorPropertyRequests(vendorId).then(
      (rows) => {
        if (cancelled) return;
        setRequests(rows);
        setLoadedFor(vendorId);
      },
      (err) => console.error('Failed to load property requests:', err),
    );
    return () => {
      cancelled = true;
    };
  }, [vendorId]);

  const current = useMemo(
    () => (vendorId && loadedFor === vendorId ? requests : []),
    [vendorId, loadedFor, requests],
  );

  /** 申請した建物を候補にすぐ入れる（読み直しを待たない） */
  const addRequest = useCallback((row: DbPropertyRequest) => {
    setRequests((prev) => [row, ...prev.filter((r) => r.id !== row.id && r.vendor_id === row.vendor_id)]);
    setLoadedFor(row.vendor_id);
  }, []);

  return { requests: current, addRequest };
}
