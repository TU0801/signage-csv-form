import { supabase, TABLES } from '@/lib/supabase';
import { BuildingVendorStatus, VendorInspectionStatus } from '@/lib/constants';
import type { DbBuildingVendor, DbProperty, DbVendorInspection } from '@/types/database';

/** 紐付け管理・ビル追加リクエストのデータ層（共有の lib/api/relationships.ts に無いもの） */

export interface BuildingVendorWithVendor extends DbBuildingVendor {
  signage_master_vendors: { vendor_name: string } | null;
}

export interface VendorInspectionWithType extends DbVendorInspection {
  signage_master_inspection_types: {
    inspection_name: string;
    category: string | null;
    /** 紐付け済みの表を点検種別マスターと同じ順に並べるため */
    sort_order: number | null;
  } | null;
}

/** 保守会社の物件紐付け。status は絞らない（表は active、追加モーダルの除外は active + pending で使い分ける） */
// v1: js/supabase/relationships.js getBuildingVendors
export async function fetchBuildingVendors(vendorId: string): Promise<DbBuildingVendor[]> {
  const { data, error } = await supabase
    .from(TABLES.buildingVendors)
    .select('*')
    .eq('vendor_id', vendorId)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return (data ?? []) as DbBuildingVendor[];
}

/** 解除（inactive）は返さない */
// v1: js/supabase/relationships.js getVendorInspections
export async function fetchVendorInspections(vendorId: string): Promise<VendorInspectionWithType[]> {
  const { data, error } = await supabase
    .from(TABLES.vendorInspections)
    .select('*, signage_master_inspection_types(inspection_name, category, sort_order)')
    .eq('vendor_id', vendorId)
    .eq('status', VendorInspectionStatus.ACTIVE)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return (data ?? []) as VendorInspectionWithType[];
}

// v1: js/supabase/relationships.js addVendorInspection
export async function addVendorInspection(
  vendorId: string,
  inspectionId: string,
): Promise<DbVendorInspection> {
  const { data, error } = await supabase
    .from(TABLES.vendorInspections)
    .insert({ vendor_id: vendorId, inspection_id: inspectionId, status: VendorInspectionStatus.ACTIVE })
    .select()
    .single();
  if (error) throw error;
  return data as DbVendorInspection;
}

/** 解除はソフトデリート（status='inactive'） */
// v1: js/supabase/relationships.js removeVendorInspection
export async function removeVendorInspection(relationshipId: string): Promise<DbVendorInspection> {
  const { data, error } = await supabase
    .from(TABLES.vendorInspections)
    .update({ status: VendorInspectionStatus.INACTIVE })
    .eq('id', relationshipId)
    .select()
    .single();
  if (error) throw error;
  return data as DbVendorInspection;
}

// v1: js/supabase/relationships.js getPendingBuildingRequests
export async function fetchPendingBuildingRequests(): Promise<BuildingVendorWithVendor[]> {
  const { data, error } = await supabase
    .from(TABLES.buildingVendors)
    .select('*, signage_master_vendors(vendor_name)')
    .eq('status', BuildingVendorStatus.PENDING)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return (data ?? []) as BuildingVendorWithVendor[];
}

// v1: js/supabase/relationships.js approveBuildingRequest
export async function approveBuildingRequest(
  buildingVendorId: string,
  approvedBy: string,
): Promise<DbBuildingVendor> {
  const { data, error } = await supabase
    .from(TABLES.buildingVendors)
    .update({ status: BuildingVendorStatus.ACTIVE, approved_by: approvedBy })
    .eq('id', buildingVendorId)
    .select()
    .single();
  if (error) throw error;
  return data as DbBuildingVendor;
}

/** 却下は物理削除（解除のソフトデリートとは別） */
// v1: js/supabase/relationships.js rejectBuildingRequest
export async function rejectBuildingRequest(buildingVendorId: string): Promise<void> {
  const { error } = await supabase.from(TABLES.buildingVendors).delete().eq('id', buildingVendorId);
  if (error) throw error;
}

/** 申請者のメールアドレス（id → email）。管理者は全プロファイルを読める */
// v1: js/admin.js getUserEmail（profiles は getAllProfiles で読み込み済み）
export async function fetchProfileEmails(userIds: string[]): Promise<Map<string, string>> {
  if (userIds.length === 0) return new Map();
  const { data, error } = await supabase.from(TABLES.profiles).select('id, email').in('id', userIds);
  if (error) throw error;
  return new Map(((data ?? []) as { id: string; email: string }[]).map((p) => [p.id, p.email]));
}

/**
 * 追加モーダルに出す物件。active / pending で紐付いた物件を除き、property_code 単位で1つにまとめる。
 */
// v1: js/admin-relationships.js openAddBuildingModal（availableProperties の算出）
export function availablePropertiesForVendor<T extends Pick<DbProperty, 'property_code' | 'property_name'>>(
  allProperties: T[],
  linked: Pick<DbBuildingVendor, 'property_code' | 'status'>[],
): T[] {
  const linkedCodes = new Set(
    linked
      .filter((r) => r.status === BuildingVendorStatus.ACTIVE || r.status === BuildingVendorStatus.PENDING)
      .map((r) => String(r.property_code)),
  );
  const seen = new Set<string>();
  return allProperties.filter((p) => {
    const code = String(p.property_code);
    if (seen.has(code) || linkedCodes.has(code)) return false;
    seen.add(code);
    return true;
  });
}

export interface AddSummary {
  type: 'success' | 'error';
  message: string;
}

/**
 * 複数追加の結果をトースト文言にまとめる。
 * @param itemLabel 「物件」「点検種別」
 */
// v1: js/admin-relationships.js confirmBuildingSelection / confirmInspectionSelection
export function summarizeAddResults(
  results: PromiseSettledResult<unknown>[],
  itemLabel: string,
): AddSummary {
  const succeeded = results.filter((r) => r.status === 'fulfilled').length;
  const failed = results.filter((r): r is PromiseRejectedResult => r.status === 'rejected');
  if (failed.length === 0) return { type: 'success', message: `${succeeded}件の${itemLabel}を追加しました` };
  if (succeeded > 0) return { type: 'error', message: `${succeeded}件追加、${failed.length}件失敗` };
  const reason = (failed[0]?.reason as { message?: string } | undefined)?.message || '';
  if (reason.includes('duplicate') || reason.includes('unique')) {
    return { type: 'error', message: `一部の${itemLabel}は既に追加されています` };
  }
  return { type: 'error', message: '追加に失敗しました: ' + reason };
}
