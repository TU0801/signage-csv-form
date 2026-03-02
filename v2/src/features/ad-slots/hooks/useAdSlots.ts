import { useState, useEffect, useCallback } from 'react';
import { supabase, TABLES } from '@/lib/supabase';
import type { DbAdSlot } from '@/types/database';

const SLOT_COUNT = 7;

export function useAdSlots({ activeOnly = false } = {}) {
  const [slots, setSlots] = useState<DbAdSlot[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchSlots = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      let query = supabase
        .from(TABLES.adSlots)
        .select('*')
        .order('slot_index');
      if (activeOnly) {
        query = query.eq('is_active', true);
      }
      const { data, error: err } = await query;
      if (err) throw err;
      setSlots((data ?? []) as DbAdSlot[]);
    } catch (err) {
      setError(err instanceof Error ? err.message : '広告枠の取得に失敗しました');
    } finally {
      setLoading(false);
    }
  }, [activeOnly]);

  useEffect(() => {
    fetchSlots();
  }, [fetchSlots]);

  const ensureSlots = useCallback(async () => {
    const { data, error: err } = await supabase
      .from(TABLES.adSlots)
      .select('slot_index');
    if (err) throw err;
    const existingIndices = new Set((data ?? []).map((d: { slot_index: number }) => d.slot_index));
    const missing: { slot_index: number; is_active: boolean; sort_order: number }[] = [];
    for (let i = 1; i <= SLOT_COUNT; i++) {
      if (!existingIndices.has(i)) {
        missing.push({ slot_index: i, is_active: false, sort_order: i });
      }
    }
    if (missing.length > 0) {
      const { error: insertErr } = await supabase.from(TABLES.adSlots).insert(missing);
      if (insertErr) throw insertErr;
    }
    await fetchSlots();
  }, [fetchSlots]);

  const updateSlot = useCallback(
    async (
      id: string,
      params: {
        image_url?: string | null;
        caption?: string | null;
        link_url?: string | null;
        is_active?: boolean;
      },
    ) => {
      const { error: err } = await supabase
        .from(TABLES.adSlots)
        .update(params)
        .eq('id', id);
      if (err) throw err;
      await fetchSlots();
    },
    [fetchSlots],
  );

  return {
    slots,
    loading,
    error,
    refetch: fetchSlots,
    ensureSlots,
    updateSlot,
  };
}
