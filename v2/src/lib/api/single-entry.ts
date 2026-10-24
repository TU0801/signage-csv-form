import { supabase, TABLES } from '@/lib/supabase';
import { VendorInspectionStatus } from '@/lib/constants';
import type { DbEntry, DbSetting } from '@/types/database';

/*
 * 1件入力（v1 index.html / js/script.js）が使う読み書き。
 * 列名は実DB（signage.signage_entries / signage_vendor_inspections / signage_master_settings）で確認済み（2026-10-15）。
 */

/** 入力画面が使う設定値（v1 index.html initAuth の window.appSettings） */
export interface AppSettings {
  display_time_max: number;
  display_time_default: number;
  remarks_chars_per_line: number;
  remarks_max_lines: number;
  notice_text_max_chars: number;
}

/** 設定が読めないときの既定値（v1 index.html initAuth と同じ値） */
export const DEFAULT_APP_SETTINGS: AppSettings = {
  display_time_max: 30,
  display_time_default: 6,
  remarks_chars_per_line: 25,
  remarks_max_lines: 5,
  notice_text_max_chars: 200,
};

/** 設定の行を既定値に被せる。数値にならない値は既定値のまま */
// v1: index.html initAuth（settings.forEach で parseInt して window.appSettings へ）
export function toAppSettings(rows: Pick<DbSetting, 'setting_key' | 'setting_value'>[]): AppSettings {
  const settings: AppSettings = { ...DEFAULT_APP_SETTINGS };
  rows.forEach((r) => {
    if (!Object.prototype.hasOwnProperty.call(settings, r.setting_key)) return;
    const n = parseInt(r.setting_value, 10);
    if (!Number.isNaN(n)) settings[r.setting_key as keyof AppSettings] = n;
  });
  return settings;
}

/** 設定を読む。失敗したら既定値（v1 も読めなければ既定値で動く） */
// v1: js/supabase/settings.js getSettings
export async function fetchAppSettings(): Promise<AppSettings> {
  try {
    const { data, error } = await supabase
      .from(TABLES.settings)
      .select('setting_key, setting_value');
    if (error) throw error;
    return toAppSettings((data ?? []) as Pick<DbSetting, 'setting_key' | 'setting_value'>[]);
  } catch (e) {
    console.error('Failed to load settings:', e);
    return { ...DEFAULT_APP_SETTINGS };
  }
}

/**
 * 保守会社に紐付けた（active の）点検種別の id。取得に失敗したら空（紐付けなしの並びで続行する）。
 */
// v1: js/script.js loadLinkedInspections → js/supabase/relationships.js getVendorInspections
export async function fetchLinkedInspectionIds(vendorId: string): Promise<Set<string>> {
  const ids = new Set<string>();
  try {
    const { data, error } = await supabase
      .from(TABLES.vendorInspections)
      .select('inspection_id')
      .eq('vendor_id', vendorId)
      .eq('status', VendorInspectionStatus.ACTIVE);
    if (error) throw error;
    ((data ?? []) as { inspection_id: string | null }[]).forEach((r) => {
      if (r?.inspection_id) ids.add(r.inspection_id);
    });
  } catch (e) {
    console.error('紐づけ点検種別の取得に失敗しました:', e);
  }
  return ids;
}

/**
 * 今月の初め（v1 と同じ値）。端末の時刻の1日 0:00 を UTC の日付にしたもの（YYYY-MM-DD）。
 * 日本時間では前月末日から拾う（10月なら '2026-09-30' = 日本時間 9/30 9:00 以降。v1 の不具合候補。直さない）。
 */
export function startOfMonthIso(now: Date = new Date()): string {
  return new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0]!;
}

/** 自分が今月登録したエントリー（新しい順）。失敗したら空 */
// v1: js/supabase/entries.js getUserEntriesCurrentMonth
export async function fetchMyEntriesThisMonth(userId: string, now: Date = new Date()): Promise<DbEntry[]> {
  const { data, error } = await supabase
    .from(TABLES.entries)
    .select('*')
    .eq('user_id', userId)
    .gte('created_at', startOfMonthIso(now))
    .order('created_at', { ascending: false });
  if (error) {
    console.error('Error fetching user entries:', error);
    return [];
  }
  return (data ?? []) as DbEntry[];
}

/**
 * 申請で INSERT する1行（frame_no は v1 も送らない。DB の既定値 '1' が入る）。
 * property_inspection_id・vendor_id・target_month は点検ポータルから申請したときだけ入れる（1件入力・一括入力は送らない）
 */
export type EntryInsertRow = Pick<
  DbEntry,
  | 'user_id'
  | 'property_code'
  | 'terminal_id'
  | 'vendor_name'
  | 'emergency_contact'
  | 'inspection_type'
  | 'template_no'
  | 'inspection_start'
  | 'inspection_end'
  | 'remarks'
  | 'memo'
  | 'announcement'
  | 'display_start_date'
  | 'display_start_time'
  | 'display_end_date'
  | 'display_end_time'
  | 'display_duration'
  | 'poster_type'
  | 'poster_image'
  | 'poster_position'
  | 'status'
  | 'property_inspection_id'
  | 'vendor_id'
  | 'target_month'
>;

/** まとめて1回の INSERT で申請する（全件成功か全件失敗。v1 と同じ） */
// v1: js/supabase/entries.js createEntries
export async function insertEntries(rows: EntryInsertRow[]): Promise<DbEntry[]> {
  const { data, error } = await supabase.from(TABLES.entries).insert(rows).select();
  if (error) throw error;
  return (data ?? []) as DbEntry[];
}
