import { useCallback, useEffect, useMemo, useState } from 'react';
import { useBulkStore } from '@/stores/bulkStore';
import { fetchVendorPropertyRequests } from '@/lib/api/property-requests';
import type { DbPropertyRequest } from '@/types/database';
import { approvedCodeMap, isProvisionalCode, provisionalBuildings } from '../lib/provisional';

/**
 * 点検登録フォーム（一括入力）の未承認の建物（修正依頼1025 F2）。選択中の保守会社の建物追加の申請を読み、
 * 今月の承認待ちの建物を物件の候補に入れる。承認済みの建物の仮のコードの手の行（自動保存から戻した行）は承認後の物件に付け替える。
 * 物件の候補は保守会社の切り替え・読み直しで入れ直されるので、そのたびに入れ直す（ストアの処理は変わらなければ何もしない）
 */
export function useProvisionalBuildings(vendorId: string | null, ready: boolean) {
  const [requests, setRequests] = useState<DbPropertyRequest[]>([]);
  const [loadedFor, setLoadedFor] = useState<string | null>(null);

  useEffect(() => {
    if (!ready || !vendorId) return;
    let cancelled = false;
    fetchVendorPropertyRequests(vendorId).then(
      (rows) => {
        if (cancelled) return;
        setRequests(rows);
        setLoadedFor(vendorId);
      },
      // 読めなくても点検登録フォームは使える（未承認の建物の行が出ないだけ）
      (err) => console.error('Failed to load property requests:', err),
    );
    return () => {
      cancelled = true;
    };
  }, [ready, vendorId]);

  // 保守会社を外した・切り替えた直後は前の保守会社の申請を使わない
  const current = useMemo(
    () => (vendorId && loadedFor === vendorId ? requests : []),
    [vendorId, loadedFor, requests],
  );
  const properties = useBulkStore((s) => s.masterData.properties);
  const hasProvisionalRows = useBulkStore((s) =>
    s.rows.some((r) => !r.schedule && isProvisionalCode(r.propertyCode)),
  );
  useEffect(() => {
    if (!ready) return;
    useBulkStore.getState().setProvisionalBuildings(provisionalBuildings(current), approvedCodeMap(current));
  }, [ready, current, properties, hasProvisionalRows]);

  /** 申請した建物を候補にすぐ入れる（読み直しを待たない） */
  const addRequest = useCallback(
    (row: DbPropertyRequest) => {
      const next = [row, ...current.filter((r) => r.id !== row.id)];
      setRequests(next);
      setLoadedFor(row.vendor_id);
      useBulkStore.getState().setProvisionalBuildings(provisionalBuildings(next), approvedCodeMap(next));
    },
    [current],
  );

  /** 未承認の建物の仮のコード → 管理会社（管理会社フィルター用） */
  const companyByCode = useMemo(
    () => new Map(provisionalBuildings(current).map((b) => [b.propertyCode, b.managementCompanyId])),
    [current],
  );

  return { addRequest, companyByCode };
}
