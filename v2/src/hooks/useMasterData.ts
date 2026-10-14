import { useState, useEffect, useCallback } from 'react';
import { useAuthStore } from '@/stores/authStore';
import { fetchAllMasterData } from '@/lib/api/masterData';
import type { MasterData } from '@/types/app';

/**
 * マスターデータ一括取得（lib/api 経由）。
 * 一般ユーザーは担当物件だけ、点検情報は biz（overlayInspections）、テンプレ画像は template_images_master。
 */
export function useMasterData() {
  const role = useAuthStore((s) => s.profile?.role ?? null);
  const vendorId = useAuthStore((s) => s.profile?.vendor_id ?? null);
  const [data, setData] = useState<MasterData>({
    properties: [],
    vendors: [],
    inspectionTypes: [],
    categories: [],
    templateImages: [],
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchAll = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setData(await fetchAllMasterData(role ? { role, vendor_id: vendorId } : null));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'マスターデータの取得に失敗しました');
    } finally {
      setLoading(false);
    }
  }, [role, vendorId]);

  useEffect(() => {
    fetchAll();
  }, [fetchAll]);

  return { ...data, loading, error, refetch: fetchAll };
}
