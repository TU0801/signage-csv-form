import { useState, useEffect, useCallback } from 'react';
import { supabase, TABLES } from '@/lib/supabase';
import { MAX_AD_SLOTS } from '@/lib/constants';
import type { DbAdSlot } from '@/types/database';

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
      // 使う枠は 1〜MAX_AD_SLOTS だけ（v1: login.html / admin-masters-ads.js）
      setSlots(((data ?? []) as DbAdSlot[]).filter((s) => s.slot_index <= MAX_AD_SLOTS));
    } catch (err) {
      setError(err instanceof Error ? err.message : '広告枠の取得に失敗しました');
    } finally {
      setLoading(false);
    }
  }, [activeOnly]);

  useEffect(() => {
    fetchSlots();
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
    updateSlot,
  };
}
