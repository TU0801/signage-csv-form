import { useState, useEffect, useCallback } from 'react';
import { supabase, TABLES } from '@/lib/supabase';
import { BuildingVendorStatus } from '@/lib/constants';
import {
  addBuildingVendor as apiAddBuildingVendor,
  removeBuildingVendor as apiRemoveBuildingVendor,
} from '@/lib/api/relationships';
import { useAuthStore } from '@/stores/authStore';
import type { DbBuildingVendor, DbVendorInspection } from '@/types/database';

export function useRelationships(vendorId: string | null) {
  const profile = useAuthStore((s) => s.profile);
  const [buildingVendors, setBuildingVendors] = useState<DbBuildingVendor[]>([]);
  const [vendorInspections, setVendorInspections] = useState<DbVendorInspection[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchBuildingVendors = useCallback(async () => {
    if (!vendorId) {
      setBuildingVendors([]);
      return;
    }
    // 解除済み（deleted）は出さない。v1 admin-relationships.js も active / pending だけを扱う
    const { data, error: err } = await supabase
      .from(TABLES.buildingVendors)
      .select('*')
      .eq('vendor_id', vendorId)
      .neq('status', BuildingVendorStatus.DELETED)
      .order('created_at');
    if (err) throw err;
    setBuildingVendors((data ?? []) as DbBuildingVendor[]);
  }, [vendorId]);

  const fetchVendorInspections = useCallback(async () => {
    if (!vendorId) {
      setVendorInspections([]);
      return;
    }
    const { data, error: err } = await supabase
      .from(TABLES.vendorInspections)
      .select('*')
      .eq('vendor_id', vendorId)
      .order('created_at');
    if (err) throw err;
    setVendorInspections((data ?? []) as DbVendorInspection[]);
  }, [vendorId]);

  const fetchAll = useCallback(async () => {
    if (!vendorId) {
      setBuildingVendors([]);
      setVendorInspections([]);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      await Promise.all([fetchBuildingVendors(), fetchVendorInspections()]);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'データの取得に失敗しました');
    } finally {
      setLoading(false);
    }
  }, [vendorId, fetchBuildingVendors, fetchVendorInspections]);

  useEffect(() => {
    fetchAll();
  }, [fetchAll]);

  // Building-vendor CRUD
  // 追加は解除済みの行を UPDATE で戻し、解除はソフトデリート（v1 と同じ。UNIQUE(property_code, vendor_id) がある）
  const addBuildingVendor = useCallback(
    async (propertyCode: string) => {
      if (!vendorId) throw new Error('保守会社が選択されていません');
      await apiAddBuildingVendor({ propertyCode, vendorId, profile });
      await fetchBuildingVendors();
    },
    [vendorId, profile, fetchBuildingVendors],
  );

  const removeBuildingVendor = useCallback(
    async (id: string) => {
      await apiRemoveBuildingVendor(id);
      await fetchBuildingVendors();
    },
    [fetchBuildingVendors],
  );

  // Vendor-inspection CRUD
  const addVendorInspection = useCallback(
    async (inspectionId: string) => {
      if (!vendorId) throw new Error('保守会社が選択されていません');
      const { error: err } = await supabase.from(TABLES.vendorInspections).insert({
        vendor_id: vendorId,
        inspection_id: inspectionId,
        status: 'active',
      });
      if (err) throw err;
      await fetchVendorInspections();
    },
    [vendorId, fetchVendorInspections],
  );

  const removeVendorInspection = useCallback(
    async (id: string) => {
      const { error: err } = await supabase
        .from(TABLES.vendorInspections)
        .delete()
        .eq('id', id);
      if (err) throw err;
      await fetchVendorInspections();
    },
    [fetchVendorInspections],
  );

  const toggleVendorInspectionStatus = useCallback(
    async (id: string, currentStatus: 'active' | 'inactive') => {
      const newStatus = currentStatus === 'active' ? 'inactive' : 'active';
      const { error: err } = await supabase
        .from(TABLES.vendorInspections)
        .update({ status: newStatus })
        .eq('id', id);
      if (err) throw err;
      await fetchVendorInspections();
    },
    [fetchVendorInspections],
  );

  return {
    buildingVendors,
    vendorInspections,
    loading,
    error,
    refetch: fetchAll,
    addBuildingVendor,
    removeBuildingVendor,
    addVendorInspection,
    removeVendorInspection,
    toggleVendorInspectionStatus,
  };
}
