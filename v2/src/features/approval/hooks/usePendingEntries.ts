import { useState, useCallback } from 'react';
import { supabase, TABLES } from '@/lib/supabase';
import type { DbEntry } from '@/types/database';
import { EntryStatus } from '@/lib/constants';

export function usePendingEntries() {
  const [entries, setEntries] = useState<DbEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchPendingEntries = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const { data, error: queryError } = await supabase
        .from(TABLES.entries)
        .select('*')
        .eq('status', EntryStatus.DRAFT)
        .order('created_at', { ascending: false });
      if (queryError) throw queryError;
      setEntries(data as DbEntry[]);
    } catch (err) {
      setError(err instanceof Error ? err.message : '承認待ちエントリーの取得に失敗しました');
    } finally {
      setLoading(false);
    }
  }, []);

  const approveEntry = useCallback(
    async (id: string) => {
      const { error } = await supabase
        .from(TABLES.entries)
        .update({ status: EntryStatus.READY, updated_at: new Date().toISOString() })
        .eq('id', id);
      if (error) throw error;
      setEntries((prev) => prev.filter((e) => e.id !== id));
    },
    [],
  );

  const rejectEntry = useCallback(
    async (id: string) => {
      const { error } = await supabase.from(TABLES.entries).delete().eq('id', id);
      if (error) throw error;
      setEntries((prev) => prev.filter((e) => e.id !== id));
    },
    [],
  );

  const approveBulk = useCallback(
    async (ids: string[]) => {
      if (ids.length === 0) return;
      const { error } = await supabase
        .from(TABLES.entries)
        .update({ status: EntryStatus.READY, updated_at: new Date().toISOString() })
        .in('id', ids);
      if (error) throw error;
      setEntries((prev) => prev.filter((e) => !ids.includes(e.id)));
    },
    [],
  );

  return {
    entries,
    loading,
    error,
    fetchPendingEntries,
    approveEntry,
    rejectEntry,
    approveBulk,
  };
}
