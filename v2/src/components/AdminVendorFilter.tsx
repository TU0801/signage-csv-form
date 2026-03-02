import { useState, useEffect, useCallback } from 'react';
import { Select } from '@/components/ui/Select';
import { useAuth } from '@/hooks/useAuth';
import { supabase, TABLES } from '@/lib/supabase';
import { BuildingVendorStatus } from '@/lib/constants';
import type { DbVendor, DbProperty } from '@/types/database';

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
 * 管理者が保守会社を選択した場合、building_vendorsテーブルから
 * 当該会社に紐付く物件コードを取得するフック。
 */
export function useAdminVendorFilter() {
  const { isAdmin } = useAuth();
  const [selectedVendorId, setSelectedVendorId] = useState('');
  const [filteredPropertyCodes, setFilteredPropertyCodes] = useState<Set<string> | null>(null);

  useEffect(() => {
    if (!isAdmin || !selectedVendorId) {
      setFilteredPropertyCodes(null);
      return;
    }

    let cancelled = false;

    (async () => {
      const { data } = await supabase
        .from(TABLES.buildingVendors)
        .select('property_code')
        .eq('vendor_id', selectedVendorId)
        .eq('status', BuildingVendorStatus.ACTIVE);

      if (!cancelled && data) {
        setFilteredPropertyCodes(new Set(data.map((d) => d.property_code)));
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [isAdmin, selectedVendorId]);

  const filterProperties = useCallback(
    (properties: DbProperty[]): DbProperty[] => {
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
