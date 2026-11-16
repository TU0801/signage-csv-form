import { supabase, RPC, TABLES } from '@/lib/supabase';
import type { EntryVendorDefaultsPayload, MgmtVendorDefaultRow } from '@/lib/vendorDefaults';

/*
 * 管理会社ごとの保守会社の既定の上書き（修正依頼1115 (5)。scripts/fix-1115-vendor-overrides.sql）。
 * 表 signage_mgmt_vendor_overrides: 管理者は全件、管理会社は自社の行だけ読み書きできる（RLS）。
 * 誰が・いつ（updated_by・updated_at）と管理会社（省けば自社）は DB が決め、TPL は実在するものだけ通る。
 * 保守会社は表を直接読めないので、申請画面は entry_vendor_defaults から読む
 */

/** 管理会社の保守会社タブ（保守会社 × 紐付けた点検種別の行に、既定と自社の上書き） */
export async function fetchMgmtVendorDefaults(): Promise<MgmtVendorDefaultRow[]> {
  const { data, error } = await supabase.rpc(RPC.mgmtVendorDefaults);
  if (error) throw error;
  return (data ?? []) as MgmtVendorDefaultRow[];
}

/** 申請画面の初期値に使う上書き（物件コードを省くと見られる物件全部） */
export async function fetchEntryVendorDefaults(propertyCode?: string): Promise<EntryVendorDefaultsPayload> {
  const { data, error } = await supabase.rpc(
    RPC.entryVendorDefaults,
    propertyCode ? { p_property_code: propertyCode } : {},
  );
  if (error) throw error;
  const payload = (data ?? {}) as Partial<EntryVendorDefaultsPayload>;
  return { properties: payload.properties ?? {}, overrides: payload.overrides ?? [] };
}

/** 上書きの値の種類（緊急連絡先は保守会社単位＝種別なしの行、TPL は点検種別ごとの行） */
export type OverrideValue =
  | { kind: 'contact'; vendorId: string; emergencyContact: string }
  | { kind: 'template'; vendorId: string; inspectionTypeId: string; templateNo: string };

/** 上書きを登録する（既存の行があれば id で更新）。管理会社は DB が自社にする */
export async function saveVendorOverride(existingId: string | null, value: OverrideValue): Promise<void> {
  const fields =
    value.kind === 'contact'
      ? { emergency_contact: value.emergencyContact }
      : { template_no: value.templateNo };
  if (existingId) {
    const { data, error } = await supabase
      .from(TABLES.mgmtVendorOverrides)
      .update(fields)
      .eq('id', existingId)
      .select('id');
    if (error) throw error;
    // RLS で空振りしたとき（他社の行・権限なし）は成功に見せない
    if (!data || data.length === 0) throw new Error('この設定を変更する権限がありません');
    return;
  }
  const { error } = await supabase.from(TABLES.mgmtVendorOverrides).insert({
    vendor_id: value.vendorId,
    inspection_type_id: value.kind === 'template' ? value.inspectionTypeId : null,
    ...fields,
  });
  if (error) throw error;
}

/** 上書きを消す（既定に戻す） */
export async function deleteVendorOverride(id: string): Promise<void> {
  const { data, error } = await supabase.from(TABLES.mgmtVendorOverrides).delete().eq('id', id).select('id');
  if (error) throw error;
  if (!data || data.length === 0) throw new Error('この設定を既定に戻す権限がありません');
}
