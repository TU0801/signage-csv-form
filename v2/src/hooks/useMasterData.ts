import { useState, useEffect, useCallback } from 'react';
import { supabase, TABLES } from '@/lib/supabase';
import type { MasterData } from '@/types/app';
import type { DbProperty, DbVendor, DbInspectionType, DbCategory } from '@/types/database';

export function useMasterData() {
  const [data, setData] = useState<MasterData>({
    properties: [],
    vendors: [],
    inspectionTypes: [],
    categories: [],
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchAll = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [propertiesRes, vendorsRes, inspectionTypesRes, categoriesRes] = await Promise.all([
        supabase.from(TABLES.properties).select('*').order('property_code'),
        supabase.from(TABLES.vendors).select('*').order('vendor_name'),
        supabase.from(TABLES.inspectionTypes).select('*').order('sort_order'),
        supabase.from(TABLES.categories).select('*').order('sort_order'),
      ]);

      if (propertiesRes.error) throw propertiesRes.error;
      if (vendorsRes.error) throw vendorsRes.error;
      if (inspectionTypesRes.error) throw inspectionTypesRes.error;
      if (categoriesRes.error) throw categoriesRes.error;

      setData({
        properties: propertiesRes.data as DbProperty[],
        vendors: vendorsRes.data as DbVendor[],
        inspectionTypes: inspectionTypesRes.data as DbInspectionType[],
        categories: categoriesRes.data as DbCategory[],
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'マスターデータの取得に失敗しました');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchAll();
  }, [fetchAll]);

  return { ...data, loading, error, refetch: fetchAll };
}
