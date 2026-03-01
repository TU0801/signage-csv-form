import { useState, useEffect, useCallback } from 'react';
import { supabase, TABLES } from '@/lib/supabase';
import type { DbSetting } from '@/types/database';

export function useSettings() {
  const [settings, setSettings] = useState<DbSetting[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchSettings = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const { data, error: err } = await supabase
        .from(TABLES.settings)
        .select('*')
        .order('setting_key');
      if (err) throw err;
      setSettings((data ?? []) as DbSetting[]);
    } catch (err) {
      setError(err instanceof Error ? err.message : '設定の取得に失敗しました');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchSettings();
  }, [fetchSettings]);

  const updateSetting = useCallback(
    async (id: string, value: string) => {
      const { error: err } = await supabase
        .from(TABLES.settings)
        .update({ setting_value: value })
        .eq('id', id);
      if (err) throw err;
      await fetchSettings();
    },
    [fetchSettings],
  );

  const addSetting = useCallback(
    async (key: string, value: string, description?: string) => {
      const { error: err } = await supabase.from(TABLES.settings).insert({
        setting_key: key,
        setting_value: value,
        description: description || null,
      });
      if (err) throw err;
      await fetchSettings();
    },
    [fetchSettings],
  );

  const deleteSetting = useCallback(
    async (id: string) => {
      const { error: err } = await supabase.from(TABLES.settings).delete().eq('id', id);
      if (err) throw err;
      await fetchSettings();
    },
    [fetchSettings],
  );

  return {
    settings,
    loading,
    error,
    refetch: fetchSettings,
    updateSetting,
    addSetting,
    deleteSetting,
  };
}
