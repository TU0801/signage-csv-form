import { useState, useEffect, useCallback } from 'react';
import { Select } from '@/components/ui/Select';
import { useAuth } from '@/hooks/useAuth';
import { fetchActivePropertyCodes } from '@/lib/api/relationships';
import type { DbVendor } from '@/types/database';

interface AdminVendorFilterProps {
  vendors: DbVendor[];
  onVendorFilter: (vendorId: string) => void;
}

/**
 * 管理者用の保守会社フィルタ。
 * 管理者ログイン時にのみ表示され、選択した保守会社に紐付く物件・点検種別にフィルタする。
 */
export function AdminVendorFilter({ vendors, onVendorFilter }: AdminVendorFilterProps) {
  const { isAdmin } = useAuth();

  if (!isAdmin) return null;

  const vendorOptions = vendors.map((v) => ({
    value: v.id,
    label: v.vendor_name,
  }));

  return (
    <div className="rounded-lg border border-blue-200 bg-blue-50 p-4">
      <label className="block text-sm font-medium text-blue-800 mb-2">
        保守会社フィルタ（管理者用）
      </label>
      <Select
        placeholder="全ての保守会社"
        options={vendorOptions}
        onChange={(e) => onVendorFilter(e.target.value)}
      />
    </div>
  );
}

/**
 * 管理者が保守会社を選択した場合、signage_building_vendors から
 * 当該会社に active で紐付く物件コードを取得するフック。
 */
export function useAdminVendorFilter() {
  const { isAdmin } = useAuth();
  const [selectedVendorId, setSelectedVendorId] = useState('');
  // 取得結果はどの保守会社のものかと一緒に持つ（選択を外した・切り替えた直後に古い結果で絞らない）
  const [fetched, setFetched] = useState<{ vendorId: string; codes: Set<string> } | null>(null);

  useEffect(() => {
    if (!isAdmin || !selectedVendorId) return;

    let cancelled = false;

    (async () => {
      try {
        const codes = await fetchActivePropertyCodes(selectedVendorId);
        if (!cancelled) setFetched({ vendorId: selectedVendorId, codes: new Set(codes) });
      } catch (err) {
        console.error('保守会社の担当物件の取得に失敗しました', err);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [isAdmin, selectedVendorId]);

  const filteredPropertyCodes =
    isAdmin && selectedVendorId && fetched?.vendorId === selectedVendorId ? fetched.codes : null;

  const filterProperties = useCallback(
    <T extends { property_code: string }>(properties: T[]): T[] => {
      if (!filteredPropertyCodes) return properties;
      return properties.filter((p) => filteredPropertyCodes.has(p.property_code));
    },
    [filteredPropertyCodes],
  );

  return {
    selectedVendorId,
    setSelectedVendorId,
    filterProperties,
    isFiltering: isAdmin && !!selectedVendorId,
  };
}
