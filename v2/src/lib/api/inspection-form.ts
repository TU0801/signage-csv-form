import { supabase, RPC } from '@/lib/supabase';
import type { DbInspectionCompletion, RpcInspectionDateRow } from '@/types/database';
import type { RpcPropertyManagementCompanyRow } from '@/types/rpc';

/*
 * 点検登録フォーム（2026-10-24）の読み書き。定義は scripts/fix-1024-core.sql。
 * 範囲（管理者は全件・保守会社は担当・管理会社は自社物件）と権限は DB 側の RPC が持つ。
 */

/** 物件ごとの管理会社（管理会社フィルターの候補）。管理者は全物件、保守会社は担当物件と担当の点検の物件 */
export async function fetchScopedManagementCompanies(): Promise<RpcPropertyManagementCompanyRow[]> {
  const { data, error } = await supabase.rpc(RPC.managementCompaniesScoped);
  if (error) throw error;
  return (data ?? []) as RpcPropertyManagementCompanyRow[];
}

/** 範囲内の完了連絡 */
export async function fetchCompletions(): Promise<DbInspectionCompletion[]> {
  const { data, error } = await supabase.rpc(RPC.portalCompletions);
  if (error) throw error;
  return (data ?? []) as DbInspectionCompletion[];
}

/** 完了連絡を記録する（点検の保守会社と管理者。同じ点検・対象月は1件） */
export async function markCompleted(inspectionId: string, targetMonth: string): Promise<DbInspectionCompletion> {
  const { data, error } = await supabase.rpc(RPC.portalMarkCompleted, {
    p_inspection_id: inspectionId,
    p_target_month: targetMonth,
  });
  if (error) throw error;
  return data as DbInspectionCompletion;
}

/** 完了連絡を取り消す（連絡した保守会社と同じ保守会社か管理者） */
export async function unmarkCompleted(inspectionId: string, targetMonth: string): Promise<boolean> {
  const { data, error } = await supabase.rpc(RPC.portalUnmarkCompleted, {
    p_inspection_id: inspectionId,
    p_target_month: targetMonth,
  });
  if (error) throw error;
  return Boolean(data);
}

/** 検査月（直近の実施年月）。値のある点検だけ */
export async function fetchInspectionDates(): Promise<RpcInspectionDateRow[]> {
  const { data, error } = await supabase.rpc(RPC.portalInspectionDates);
  if (error) throw error;
  return (data ?? []) as RpcInspectionDateRow[];
}
