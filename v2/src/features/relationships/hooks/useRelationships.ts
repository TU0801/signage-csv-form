import { useState, useEffect, useCallback } from 'react';
import { supabase, TABLES } from '@/lib/supabase';
import type { DbBuildingVendor, DbVendorInspection } from '@/types/database';

export function useRelationships(vendorId: string | null) {
  const [buildingVendors, setBuildingVendors] = useState<DbBuildingVendor[]>([]);
  const [vendorInspections, setVendorInspections] = useState<DbVendorInspection[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchBuildingVendors = useCallback(async () => {
    if (!vendorId) {
      setBuildingVendors([]);
      return;
    }
    const { data, error: err } = await supabase
      .from(TABLES.buildingVendors)
      .select('*')
      .eq('vendor_id', vendorId)
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
  const addBuildingVendor = useCallback(
    async (propertyCode: string) => {
      if (!vendorId) throw new Error('保守会社が選択されていません');
      const { error: err } = await supabase.from(TABLES.buildingVendors).insert({
        property_code: propertyCode,
        vendor_id: vendorId,
        status: 'active',
      });
      if (err) throw err;
      await fetchBuildingVendors();
    },
    [vendorId, fetchBuildingVendors],
  );

  const removeBuildingVendor = useCallback(
    async (id: string) => {
      const { error: err } = await supabase.from(TABLES.buildingVendors).delete().eq('id', id);
      if (err) throw err;
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
