import { useState, useCallback } from 'react';
import { supabase, TABLES } from '@/lib/supabase';
import type { DbBuildingVendor } from '@/types/database';
import { BuildingVendorStatus } from '@/lib/constants';

export interface BuildingRequestRow extends DbBuildingVendor {
  propertyName?: string;
  vendorName?: string;
}

export function useBuildingRequests() {
  const [requests, setRequests] = useState<BuildingRequestRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchPendingRequests = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const { data, error: queryError } = await supabase
        .from(TABLES.buildingVendors)
        .select('*')
        .eq('status', BuildingVendorStatus.PENDING)
        .order('created_at', { ascending: false });
      if (queryError) throw queryError;

      const rows = data as DbBuildingVendor[];

      // Resolve property names and vendor names
      const propertyCodes = [...new Set(rows.map((r) => r.property_code))];
      const vendorIds = [...new Set(rows.map((r) => r.vendor_id))];

      const [propertiesRes, vendorsRes] = await Promise.all([
        propertyCodes.length > 0
          ? supabase
              .from(TABLES.properties)
              .select('property_code, property_name')
              .in('property_code', propertyCodes)
          : Promise.resolve({ data: [], error: null }),
        vendorIds.length > 0
          ? supabase.from(TABLES.vendors).select('id, vendor_name').in('id', vendorIds)
          : Promise.resolve({ data: [], error: null }),
      ]);

      const propertyMap = new Map(
        (propertiesRes.data ?? []).map((p: { property_code: string; property_name: string }) => [
          p.property_code,
          p.property_name,
        ]),
      );
      const vendorMap = new Map(
        (vendorsRes.data ?? []).map((v: { id: string; vendor_name: string }) => [
          v.id,
          v.vendor_name,
        ]),
      );

      const enrichedRows: BuildingRequestRow[] = rows.map((r) => ({
        ...r,
        propertyName: propertyMap.get(r.property_code) ?? r.property_code,
        vendorName: vendorMap.get(r.vendor_id) ?? r.vendor_id,
      }));

      setRequests(enrichedRows);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'ビル追加リクエストの取得に失敗しました');
    } finally {
      setLoading(false);
    }
  }, []);

  const approveRequest = useCallback(async (id: string, approvedBy: string) => {
    const { error } = await supabase
      .from(TABLES.buildingVendors)
      .update({
        status: BuildingVendorStatus.ACTIVE,
        approved_by: approvedBy,
        updated_at: new Date().toISOString(),
      })
      .eq('id', id);
    if (error) throw error;
    setRequests((prev) => prev.filter((r) => r.id !== id));
  }, []);

  const rejectRequest = useCallback(async (id: string) => {
    const { error } = await supabase
      .from(TABLES.buildingVendors)
      .update({
        status: BuildingVendorStatus.DELETED,
        updated_at: new Date().toISOString(),
      })
      .eq('id', id);
    if (error) throw error;
    setRequests((prev) => prev.filter((r) => r.id !== id));
  }, []);

  return {
    requests,
    loading,
    error,
    fetchPendingRequests,
    approveRequest,
    rejectRequest,
  };
}
