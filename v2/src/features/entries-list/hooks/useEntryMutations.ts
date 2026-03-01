import { useCallback } from 'react';
import { supabase, TABLES } from '@/lib/supabase';
import type { DbEntry } from '@/types/database';
import type { EntryStatus } from '@/lib/constants';

export function useEntryMutations(onSuccess: () => void) {
  const updateEntry = useCallback(
    async (id: string, updates: Partial<DbEntry>) => {
      const { error } = await supabase
        .from(TABLES.entries)
        .update({ ...updates, updated_at: new Date().toISOString() })
        .eq('id', id);
      if (error) throw error;
      onSuccess();
    },
    [onSuccess],
  );

  const updateStatus = useCallback(
    async (id: string, status: EntryStatus) => {
      const { error } = await supabase
        .from(TABLES.entries)
        .update({ status, updated_at: new Date().toISOString() })
        .eq('id', id);
      if (error) throw error;
      onSuccess();
    },
    [onSuccess],
  );

  const deleteEntry = useCallback(
    async (id: string) => {
      const { error } = await supabase.from(TABLES.entries).delete().eq('id', id);
      if (error) throw error;
      onSuccess();
    },
    [onSuccess],
  );

  const updateStatusBulk = useCallback(
    async (ids: string[], status: EntryStatus) => {
      if (ids.length === 0) return;
      const { error } = await supabase
        .from(TABLES.entries)
        .update({ status, updated_at: new Date().toISOString() })
        .in('id', ids);
      if (error) throw error;
      onSuccess();
    },
    [onSuccess],
  );

  return {
    updateEntry,
    updateStatus,
    deleteEntry,
    updateStatusBulk,
  };
}
