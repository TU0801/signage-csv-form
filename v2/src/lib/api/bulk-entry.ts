import { RPC, supabase, TABLES } from '@/lib/supabase';
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
  /** 台ごとの申請の台（台が2台以上の点検の予定の行だけ。修正依頼1026 I7） */
  property_unit_id?: string | null;
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

/** 一括入力テンプレートの情報（RPC bulk_template_info） */
export interface BulkTemplateInfo {
  /** 保守会社の略称（biz.companies.short_name。空なら名前）。保守会社が無ければ null */
  short_name: string | null;
  /** その保守会社の点検行 id を業務システムの「設備」の並び（大分類 → 登録順）にしたもの */
  inspection_ids: string[];
}

/**
 * 一括入力テンプレートの保守会社の略称と点検種別の並び（修正依頼1027 (2)）。
 * 管理者は vendorId の保守会社、保守会社のアカウントは自社（vendorId は DB が見ない）
 */
export async function fetchBulkTemplateInfo(vendorId: string | null): Promise<BulkTemplateInfo> {
  const { data, error } = await supabase.rpc(RPC.bulkTemplateInfo, { p_vendor_id: vendorId });
  if (error) throw error;
  const info = (data ?? {}) as Partial<BulkTemplateInfo>;
  return { short_name: info.short_name ?? null, inspection_ids: info.inspection_ids ?? [] };
}
