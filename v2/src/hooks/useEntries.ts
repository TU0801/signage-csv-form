import { useState, useCallback } from 'react';
import { supabase, TABLES } from '@/lib/supabase';
import type { DbEntry } from '@/types/database';
import type { EntryStatus } from '@/lib/constants';

interface UseEntriesOptions {
  status?: EntryStatus;
  propertyCode?: string;
}

export function useEntries(options?: UseEntriesOptions) {
  const [entries, setEntries] = useState<DbEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchEntries = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      let query = supabase.from(TABLES.entries).select('*').order('created_at', { ascending: false });

      if (options?.status) {
        query = query.eq('status', options.status);
      }
      if (options?.propertyCode) {
        query = query.eq('property_code', options.propertyCode);
      }

      const { data, error: queryError } = await query;
      if (queryError) throw queryError;
      setEntries(data as DbEntry[]);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'エントリーの取得に失敗しました');
    } finally {
      setLoading(false);
    }
  }, [options?.status, options?.propertyCode]);

  const createEntry = useCallback(
    async (entry: Omit<DbEntry, 'id' | 'created_at' | 'updated_at' | 'inspection_co'>) => {
      const { data, error } = await supabase.from(TABLES.entries).insert(entry).select().single();
      if (error) throw error;
      return data as DbEntry;
    },
    [],
  );

  const updateEntry = useCallback(async (id: string, updates: Partial<DbEntry>) => {
    const { data, error } = await supabase
      .from(TABLES.entries)
      .update({ ...updates, updated_at: new Date().toISOString() })
      .eq('id', id)
      .select()
      .single();
    if (error) throw error;
    return data as DbEntry;
  }, []);

  const deleteEntry = useCallback(async (id: string) => {
    const { error } = await supabase.from(TABLES.entries).delete().eq('id', id);
    if (error) throw error;
  }, []);

  const updateStatusBulk = useCallback(async (ids: string[], status: EntryStatus) => {
    const { error } = await supabase
      .from(TABLES.entries)
      .update({ status, updated_at: new Date().toISOString() })
      .in('id', ids);
    if (error) throw error;
  }, []);

  return {
    entries,
    loading,
    error,
    fetchEntries,
    createEntry,
    updateEntry,
    deleteEntry,
    updateStatusBulk,
  };
}
