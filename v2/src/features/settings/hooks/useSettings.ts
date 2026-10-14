import { useState, useEffect, useCallback } from 'react';
import { supabase, TABLES } from '@/lib/supabase';
import type { DbSetting } from '@/types/database';
import { SETTING_FIELDS, type SettingKey, type SettingValues } from '../settingFields';

/** 保存値が無い項目は既定値（v1 は `appSettings.x || 既定値`） */
// v1: js/admin-settings.js loadAppSettings のフォーム反映
export function toSettingValues(rows: Pick<DbSetting, 'setting_key' | 'setting_value'>[]): SettingValues {
  const stored = new Map(rows.map((r) => [r.setting_key, r.setting_value]));
  return Object.fromEntries(
    SETTING_FIELDS.map((f) => [f.key, stored.get(f.key) || String(f.defaultValue)]),
  ) as SettingValues;
}

export function useSettings() {
  const [values, setValues] = useState<SettingValues>(() => toSettingValues([]));
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // v1: js/supabase/settings.js getSettings
  const fetchSettings = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const { data, error: err } = await supabase.from(TABLES.settings).select('*');
      if (err) throw err;
      setValues(toSettingValues((data ?? []) as DbSetting[]));
    } catch (err) {
      console.error('Failed to load settings:', err);
      setError(err instanceof Error ? err.message : '設定の取得に失敗しました');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchSettings();
  }, [fetchSettings]);

  /** 5項目をまとめて保存する（setting_key で upsert。値は text） */
  // v1: js/admin-settings.js saveSettings → js/supabase/settings.js updateSettings
  const saveSettings = useCallback(async (next: Record<SettingKey, string>) => {
    const updatedAt = new Date().toISOString();
    const rows = SETTING_FIELDS.map((f) => ({
      setting_key: f.key,
      setting_value: String(next[f.key]),
      updated_at: updatedAt,
    }));
    const { error: err } = await supabase
      .from(TABLES.settings)
      .upsert(rows, { onConflict: 'setting_key' })
      .select();
    if (err) throw err;
    setValues({ ...next });
  }, []);

  return {
    values,
    loading,
    error,
    refetch: fetchSettings,
    saveSettings,
  };
}
