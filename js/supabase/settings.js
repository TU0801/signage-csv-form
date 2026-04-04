// supabase/settings.js - 設定管理

import { supabase } from './client.js';

export async function getSettings() {
  const { data, error } = await supabase.from('signage_master_settings').select('*');
  if (error) throw error;
  return data;
}

export async function getSetting(key) {
  const { data, error } = await supabase.from('signage_master_settings').select('setting_value').eq('setting_key', key).single();
  if (error && error.code !== 'PGRST116') throw error;
  return data?.setting_value;
}

export async function updateSetting(key, value) {
  const { data, error } = await supabase
    .from('signage_master_settings')
    .upsert({ setting_key: key, setting_value: String(value), updated_at: new Date().toISOString() }, { onConflict: 'setting_key' })
    .select().single();
  if (error) throw error;
  return data;
}

export async function updateSettings(settings) {
  const updates = Object.entries(settings).map(([key, value]) => ({
    setting_key: key, setting_value: String(value), updated_at: new Date().toISOString()
  }));
  const { data, error } = await supabase.from('signage_master_settings').upsert(updates, { onConflict: 'setting_key' }).select();
  if (error) throw error;
  return data;
}
