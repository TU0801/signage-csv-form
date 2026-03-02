import { useState, useEffect, useCallback, useMemo } from 'react';
import { supabase, TABLES } from '@/lib/supabase';
import type { DbEntry } from '@/types/database';
import type { EntriesFilters } from './useEntriesFilters';

export function useEntriesTable(filters: EntriesFilters) {
  const [entries, setEntries] = useState<DbEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchEntries = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      let query = supabase.from(TABLES.entries).select('*').order('created_at', { ascending: false });

      if (filters.propertyCode) {
        query = query.eq('property_code', filters.propertyCode);
      }
      if (filters.vendorName) {
        query = query.eq('vendor_name', filters.vendorName);
      }
      if (filters.status) {
        query = query.eq('status', filters.status);
      }
      if (filters.dateFrom) {
        query = query.gte('display_start_date', filters.dateFrom);
      }
      if (filters.dateTo) {
        query = query.lte('display_end_date', filters.dateTo);
      }

      const { data, error: queryError } = await query;
      if (queryError) throw queryError;
      setEntries(data as DbEntry[]);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'エントリーの取得に失敗しました');
    } finally {
      setLoading(false);
    }
  }, [filters.propertyCode, filters.vendorName, filters.status, filters.dateFrom, filters.dateTo]);

  useEffect(() => {
    fetchEntries();
  }, [fetchEntries]);

  const entryCount = useMemo(() => entries.length, [entries]);

  return {
    entries,
    loading,
    error,
    entryCount,
    refetch: fetchEntries,
  };
}
