import { supabase, TABLES, RPC } from '@/lib/supabase';
import type { DbPropertyRequest } from '@/types/database';
import type { ManagementCompanyRow } from '@/types/portal';

/*
 * 新規建物の申請（点検登録フォームに無い建物を保守会社が申請し、管理者が承認時に物件コードを入れる）。
 * 権限は DB 側（scripts/fix-1024-approval.sql の RLS・列の権限・RPC）が持つ。ここでは呼び出しと型付けだけ。
 * 既存の「ビル追加」（signage_building_vendors の pending）とは別の表。
 */

export interface PropertyRequestInput {
  vendorId: string;
  managementCompanyId: string;
  propertyName: string;
  address: string;
  inspectionTypeId: string | null;
  inspectionMonths: number[];
}

/** 申請する（status は既定の pending・申請者は auth.uid() が DB 側で入る） */
export async function createPropertyRequest(
  input: PropertyRequestInput,
): Promise<DbPropertyRequest> {
  const { data, error } = await supabase
    .from(TABLES.propertyRequests)
    .insert({
      vendor_id: input.vendorId,
      management_company_id: input.managementCompanyId,
      property_name: input.propertyName.trim(),
      address: input.address.trim() || null,
      inspection_type_id: input.inspectionTypeId,
      inspection_months: input.inspectionTypeId ? input.inspectionMonths : [],
    })
    .select()
    .single();
  if (error) throw error;
  return data as DbPropertyRequest;
}

/** 自分の申請（新しい順・直近20件）。却下の理由を申請者に見せるため */
export async function fetchMyPropertyRequests(userId: string): Promise<DbPropertyRequest[]> {
  const { data, error } = await supabase
    .from(TABLES.propertyRequests)
    .select('*')
    .eq('requested_by', userId)
    .order('created_at', { ascending: false })
    .limit(20);
  if (error) throw error;
  return (data ?? []) as DbPropertyRequest[];
}

/** 承認待ちの申請（管理者。RLS で管理者以外は自分の分しか返らない） */
export async function fetchPendingPropertyRequests(): Promise<DbPropertyRequest[]> {
  const { data, error } = await supabase
    .from(TABLES.propertyRequests)
    .select('*')
    .eq('status', 'pending')
    .order('created_at', { ascending: false });
  if (error) throw error;
  return (data ?? []) as DbPropertyRequest[];
}

/** 承認待ちの件数（管理画面サイドバー・承認待ちのタブ） */
export async function countPendingPropertyRequests(): Promise<number> {
  const { count, error } = await supabase
    .from(TABLES.propertyRequests)
    .select('id', { count: 'exact', head: true })
    .eq('status', 'pending');
  if (error) throw error;
  return count ?? 0;
}

/**
 * 承認（管理者だけ）。業務システムに物件・保守会社の紐付け・点検行ができる。
 * 端末番号（任意）を入れると業務システムの物件の端末になり、同期トリガーで signage の物件の端末にも入る
 * （scripts/fix-1024-followups-terminal.sql。形式と他の物件で使われていないことは DB が確かめる）
 */
export async function approvePropertyRequest(
  id: string,
  propertyCode: string,
  terminalId: string | null = null,
): Promise<DbPropertyRequest> {
  // 端末番号が空なら p_terminal_id を送らない（DB 側の既定 NULL）。SQL より先に画面が出ても、端末なしの承認は 2引数版で通る
  const term = terminalId?.trim();
  const { data, error } = await supabase.rpc(RPC.approvePropertyRequest, {
    p_id: id,
    p_property_code: propertyCode.trim(),
    ...(term ? { p_terminal_id: term } : {}),
  });
  if (error) throw error;
  return data as DbPropertyRequest;
}

/** 却下（管理者だけ・理由必須） */
export async function rejectPropertyRequest(
  id: string,
  reason: string,
): Promise<DbPropertyRequest> {
  const { data, error } = await supabase.rpc(RPC.rejectPropertyRequest, {
    p_id: id,
    p_reason: reason.trim(),
  });
  if (error) throw error;
  return data as DbPropertyRequest;
}

/** 申請モーダルの管理会社の候補（有効な管理会社の id と名前。管理者・保守会社のアカウントに返る） */
export async function fetchManagementCompaniesForRequest(): Promise<ManagementCompanyRow[]> {
  const { data, error } = await supabase.rpc(RPC.managementCompaniesForRequest);
  if (error) throw error;
  return (data ?? []) as ManagementCompanyRow[];
}

export interface InspectionTypeOption {
  id: string;
  name: string;
}

export interface InspectionTypeOptions {
  options: InspectionTypeOption[];
  /** true: 保守会社に紐付いた点検種別。false: 紐付けが無いので有効な点検種別すべて */
  linked: boolean;
}

/**
 * 申請モーダルの点検種別の候補。DB（inspection_type_options_for_request）が有効な点検種別だけを
 * 点検種別マスターの並び順（sort → template_no）で返す。無効な点検種別は申請時に DB が断るので候補にも出さない。
 * 保守会社に有効な紐付けがあればその点検種別（先頭が既定＝一括入力の B9(b) と同じ規則）、無ければ全点検種別
 */
export async function fetchInspectionTypeOptionsForRequest(
  vendorId: string,
): Promise<InspectionTypeOptions> {
  const { data, error } = await supabase.rpc(RPC.inspectionTypeOptionsForRequest, {
    p_vendor_id: vendorId,
  });
  if (error) throw error;
  const rows = (data ?? []) as { id: string; name: string; linked: boolean }[];
  return {
    options: rows.map(({ id, name }) => ({ id, name })),
    linked: rows[0]?.linked ?? false,
  };
}

/** 申請の状態の表示名 */
export const PROPERTY_REQUEST_STATUS_LABEL: Record<DbPropertyRequest['status'], string> = {
  pending: '承認待ち',
  approved: '承認済み',
  rejected: '却下',
};
