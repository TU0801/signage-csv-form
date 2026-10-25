import { supabase, TABLES } from '@/lib/supabase';
import type { DbEntry, DbSetting } from '@/types/database';

/** 一括入力が signage_entries に入れる列（v1 saveAll と同じ。frame_no は送らない＝DB の既定値） */
export type BulkEntryInsert = Pick<
  DbEntry,
  | 'property_code'
  | 'terminal_id'
  | 'vendor_name'
  | 'emergency_contact'
  | 'inspection_type'
  | 'template_no'
  | 'inspection_start'
  | 'inspection_end'
  | 'remarks'
  | 'announcement'
  | 'display_start_date'
  | 'display_start_time'
  | 'display_end_date'
  | 'display_end_time'
  | 'display_duration'
  | 'poster_type'
  | 'poster_image'
  | 'poster_position'
> & {
  status: 'draft';
  memo?: string | null;
  /** 2枚目以降の貼紙（修正依頼1025 D3）。無ければ送らない（DB の既定は []） */
  extra_posters?: DbEntry['extra_posters'];
  /** 点検行に結び付いた申請だけ（修正依頼1024） */
  property_inspection_id?: string | null;
  vendor_id?: string | null;
  target_month?: string | null;
  /** 未承認の建物（建物追加の申請）の行だけ（修正依頼1025 F2） */
  property_request_id?: string | null;
};

/** 設定（有効メンバーは読める。値は text） */
// v1: js/supabase/settings.js getSettings
export async function fetchBulkSettings(): Promise<Pick<DbSetting, 'setting_key' | 'setting_value'>[]> {
  const { data, error } = await supabase.from(TABLES.settings).select('*');
  if (error) throw error;
  return (data ?? []) as DbSetting[];
}

/**
 * 複数件を1回の INSERT で入れる（RLS が user_id=本人 を求めるので付ける）。
 */
// v1: js/supabase/entries.js createEntries
export async function createBulkEntries(entries: BulkEntryInsert[], userId: string): Promise<DbEntry[]> {
  if (!userId) throw new Error('ログインが必要です');
  const rows = entries.map((e) => ({ ...e, user_id: userId }));
  const { data, error } = await supabase.from(TABLES.entries).insert(rows).select();
  if (error) throw error;
  return (data ?? []) as DbEntry[];
}
