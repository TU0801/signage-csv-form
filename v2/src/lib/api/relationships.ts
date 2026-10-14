import { supabase, TABLES } from '@/lib/supabase';
import { BuildingVendorStatus } from '@/lib/constants';
import type { DbBuildingVendor, DbProfile, DbProperty } from '@/types/database';

/** 保守会社に active で紐付いている物件コード */
// v1: js/supabase/relationships.js getBuildingsByVendor（前半の紐付け取得）
export async function fetchActivePropertyCodes(vendorId: string): Promise<string[]> {
  const { data, error } = await supabase
    .from(TABLES.buildingVendors)
    .select('property_code')
    .eq('vendor_id', vendorId)
    .eq('status', BuildingVendorStatus.ACTIVE);
  if (error) throw error;
  return ((data ?? []) as { property_code: string }[]).map((r) => r.property_code);
}

/** ビル追加リクエスト（status=pending）の件数（管理画面サイドバー） */
// v1: js/admin.js updateSidebarCounts の pendingBuildingRequests.length（getPendingBuildingRequests）
export async function countPendingBuildingRequests(): Promise<number> {
  const { count, error } = await supabase
    .from(TABLES.buildingVendors)
    .select('id', { count: 'exact', head: true })
    .eq('status', BuildingVendorStatus.PENDING);
  if (error) throw error;
  return count ?? 0;
}

/**
 * ログイン中のユーザーが扱える物件。管理者は全物件、一般ユーザーは自社に active で紐付いた物件だけ
 * （RLS は有効メンバーに全物件の SELECT を許しているので、絞り込みはここで行う）。
 */
// v1: js/supabase/relationships.js getAssignedBuildings
export async function getAssignedBuildings(
  profile: Pick<DbProfile, 'role' | 'vendor_id'> | null,
): Promise<DbProperty[]> {
  if (!profile) throw new Error('ログインが必要です');
  if (profile.role === 'admin') {
    const { data, error } = await supabase.from(TABLES.properties).select('*').order('property_code');
    if (error) throw error;
    return (data ?? []) as DbProperty[];
  }
  if (!profile.vendor_id) return [];

  const propertyCodes = await fetchActivePropertyCodes(profile.vendor_id);
  if (propertyCodes.length === 0) return [];

  const { data, error } = await supabase
    .from(TABLES.properties)
    .select('*')
    .in('property_code', propertyCodes);
  if (error) throw error;
  return (data ?? []) as DbProperty[];
}

/**
 * 物件と保守会社を紐付ける。UNIQUE(property_code, vendor_id) があるので、
 * 解除済み（deleted）・申請中（pending）の既存行は INSERT せず UPDATE で再有効化する。
 * 管理者は active、一般ユーザーは pending（RLS が一般ユーザーの INSERT に pending と requested_by=本人を求める）。
 */
// v1: js/supabase/relationships.js addBuildingVendor
export async function addBuildingVendor(params: {
  propertyCode: string;
  /** 省略時はプロファイルの vendor_id */
  vendorId?: string | null;
  profile: Pick<DbProfile, 'id' | 'role' | 'vendor_id'> | null;
}): Promise<DbBuildingVendor> {
  const { propertyCode, profile } = params;
  if (!profile) throw new Error('ログインが必要です');
  const isAdminUser = profile.role === 'admin';
  const finalVendorId = params.vendorId || profile.vendor_id;
  if (!finalVendorId) throw new Error('ベンダーIDが設定されていません');

  const { data: existing } = await supabase
    .from(TABLES.buildingVendors)
    .select('id, status')
    .eq('property_code', propertyCode)
    .eq('vendor_id', finalVendorId)
    .single();

  const newStatus = isAdminUser ? BuildingVendorStatus.ACTIVE : BuildingVendorStatus.PENDING;
  const row = existing as Pick<DbBuildingVendor, 'id' | 'status'> | null;

  if (row) {
    if (row.status === BuildingVendorStatus.ACTIVE) {
      throw new Error('この物件は既に追加されています');
    }
    const { data, error } = await supabase
      .from(TABLES.buildingVendors)
      .update({
        status: newStatus,
        requested_by: profile.id,
        approved_by: isAdminUser ? profile.id : null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', row.id)
      .select()
      .single();
    if (error) throw error;
    return data as DbBuildingVendor;
  }

  const { data, error } = await supabase
    .from(TABLES.buildingVendors)
    .insert({
      property_code: propertyCode,
      vendor_id: finalVendorId,
      status: newStatus,
      requested_by: profile.id,
      approved_by: isAdminUser ? profile.id : null,
      updated_at: new Date().toISOString(),
    })
    .select()
    .single();
  if (error) throw error;
  return data as DbBuildingVendor;
}

/** 紐付けの解除はソフトデリート（status='deleted'）。物理削除すると v1 と履歴の扱いがずれる */
// v1: js/supabase/relationships.js removeBuildingVendor
export async function removeBuildingVendor(buildingVendorId: string): Promise<DbBuildingVendor> {
  const { data, error } = await supabase
    .from(TABLES.buildingVendors)
    .update({ status: BuildingVendorStatus.DELETED })
    .eq('id', buildingVendorId)
    .select()
    .single();
  if (error) throw error;
  return data as DbBuildingVendor;
}

/**
 * 物件の点検情報に出てくる保守会社を紐付けに足す（0913 依頼②。物件の保存時に呼ぶ）。
 * 追加だけで、既にある紐付けは status を問わず触らない（人が pending / 解除に変えたものを戻さない）。
 */
// v1: js/supabase/relationships.js syncBuildingVendorsFromEquipment
export async function syncBuildingVendorsFromEquipment(
  propertyCode: string,
  equipment: ReadonlyArray<{ vendor_id?: string | null } | null | undefined> | null | undefined,
  profile: Pick<DbProfile, 'id'> | null,
): Promise<{ added: number }> {
  const list = Array.isArray(equipment) ? equipment : [];
  const vendorIds = [...new Set(list.map((e) => e?.vendor_id).filter((v): v is string => !!v))];
  if (vendorIds.length === 0) return { added: 0 };

  const { data: existing, error: exError } = await supabase
    .from(TABLES.buildingVendors)
    .select('vendor_id')
    .eq('property_code', String(propertyCode));
  if (exError) throw exError;

  const have = new Set(((existing ?? []) as { vendor_id: string }[]).map((r) => String(r.vendor_id)));
  const toAdd = vendorIds.filter((id) => !have.has(String(id)));
  if (toAdd.length === 0) return { added: 0 };

  const rows = toAdd.map((vendor_id) => ({
    property_code: String(propertyCode),
    vendor_id,
    status: BuildingVendorStatus.ACTIVE,
    requested_by: profile?.id ?? null,
    approved_by: profile?.id ?? null,
  }));
  const { error } = await supabase.from(TABLES.buildingVendors).insert(rows);
  if (error) throw error;
  return { added: rows.length };
}
