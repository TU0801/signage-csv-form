import { useState, useEffect, useCallback } from 'react';
import { supabase, TABLES } from '@/lib/supabase';
import type { DbAdSlot } from '@/types/database';

/** 認証不要の公開クエリで有効な広告枠を取得 */
export function useAdSlotsPublic() {
  const [slots, setSlots] = useState<DbAdSlot[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchSlots = useCallback(async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from(TABLES.adSlots)
        .select('*')
        .eq('is_active', true)
        .order('slot_index');
      if (error) throw error;
      setSlots((data ?? []) as DbAdSlot[]);
    } catch (err) {
      console.error('広告枠の取得に失敗:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchSlots();
  }, [fetchSlots]);

  return { slots, loading };
}
