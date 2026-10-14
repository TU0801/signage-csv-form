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

/** 一般ユーザーの申請が UNIQUE(property_code, vendor_id) に当たったとき（申請中・解除済みの行は一般ユーザーから見えない） */
export const BUILDING_REQUEST_DUPLICATE_MESSAGE =
  'この物件は既にリクエスト済みか、以前に紐付けを解除された物件です。管理者にお問い合わせください';

/**
 * 物件と保守会社を紐付ける。UNIQUE(property_code, vendor_id) があるので、
 * 管理者は解除済み（deleted）・申請中（pending）の既存行を INSERT せず UPDATE で active に戻す。
 *
 * 一般ユーザーは pending で INSERT するだけ（RLS が pending と requested_by=本人を求める）。RLS の SELECT は
 * 一般ユーザーに自社の active 行しか見せないので:
 * - INSERT に .select() を付けると RETURNING が SELECT ポリシーに阻まれて 42501 になる → 付けずに入れ、null を返す
 * - 申請中・解除済みの既存行は見つけられず INSERT が 23505 になる → 日本語の案内にする
 * - UPDATE で戻す経路は、行が見えず（0 行一致）、UPDATE の条件（status='deleted' のまま）も満たせないので使わない
 * v1 も同じ実装で同じく失敗する（v1 は一般ユーザーの申請画面が呼ばれていない）。
 *
 * 戻り値: 管理者は紐付けの行、一般ユーザーは null（行を読み返せないため。呼び出し側は成否だけを使う）。
 */
// v1: js/supabase/relationships.js addBuildingVendor
export async function addBuildingVendor(params: {
  propertyCode: string;
  /** 省略時はプロファイルの vendor_id */
  vendorId?: string | null;
  profile: Pick<DbProfile, 'id' | 'role' | 'vendor_id'> | null;
}): Promise<DbBuildingVendor | null> {
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
    // 今の RLS では一般ユーザーに active 以外の行は見えないが、見えても自分では戻せない
    if (!isAdminUser) throw new Error(BUILDING_REQUEST_DUPLICATE_MESSAGE);
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

  const insertRow = {
    property_code: propertyCode,
    vendor_id: finalVendorId,
    status: newStatus,
    requested_by: profile.id,
    approved_by: isAdminUser ? profile.id : null,
    updated_at: new Date().toISOString(),
  };

  if (!isAdminUser) {
    const { error } = await supabase.from(TABLES.buildingVendors).insert(insertRow);
    if (error) {
      if (error.code === '23505') throw new Error(BUILDING_REQUEST_DUPLICATE_MESSAGE);
      throw error;
    }
    return null;
  }

  const { data, error } = await supabase
    .from(TABLES.buildingVendors)
    .insert(insertRow)
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
