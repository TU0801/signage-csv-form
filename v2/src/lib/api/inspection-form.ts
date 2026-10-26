import { supabase, RPC, TABLES } from '@/lib/supabase';
import { rpcAllRows } from '@/lib/api/masterData';
import type { DbInspectionCompletion, RpcInspectionDateRow } from '@/types/database';
import type { RpcPropertyManagementCompanyRow } from '@/types/rpc';

/*
 * 点検登録フォーム（2026-10-24）の読み書き。定義は scripts/fix-1024-core.sql。
 * 範囲（管理者は全件・保守会社は担当・管理会社は自社物件）と権限は DB 側の RPC が持つ。
 */

/** 物件ごとの管理会社（管理会社フィルターの候補）。管理者は全物件、保守会社は担当物件と担当の点検の物件 */
// 物件数が PostgREST の max_rows を超えても欠けないよう、ページを分けて全件読む（旧 property_management_companies と同じ）
export function fetchScopedManagementCompanies(): Promise<RpcPropertyManagementCompanyRow[]> {
  return rpcAllRows<RpcPropertyManagementCompanyRow>(RPC.managementCompaniesScoped);
}

/** 範囲内の完了連絡 */
export async function fetchCompletions(): Promise<DbInspectionCompletion[]> {
  const { data, error } = await supabase.rpc(RPC.portalCompletions);
  if (error) throw error;
  return (data ?? []) as DbInspectionCompletion[];
}

/**
 * 完了連絡を記録する（点検の保守会社と管理者。同じ点検・対象月・台は1件）。点検月以外の月は、毎月・申請不要の点検種別か、
 * 点検日連絡が OFF か、その月の申請があるときだけ。unitId は台ごとの完了連絡の台（修正依頼1026 I7。台の保守会社だけ）
 */
export async function markCompleted(
  inspectionId: string,
  targetMonth: string,
  unitId: string | null = null,
): Promise<DbInspectionCompletion> {
  const { data, error } = await supabase.rpc(RPC.portalMarkCompleted, {
    p_inspection_id: inspectionId,
    p_target_month: targetMonth,
    p_unit_id: unitId,
  });
  if (error) throw error;
  return data as DbInspectionCompletion;
}

/** 完了連絡を取り消す（台ごとの完了連絡は連絡した保守会社と同じ保守会社か管理者、台なしの完了連絡は点検行か台を保守する保守会社か管理者）。unitId は台ごとの完了連絡の台（null は台なしの完了連絡） */
export async function unmarkCompleted(
  inspectionId: string,
  targetMonth: string,
  unitId: string | null = null,
): Promise<boolean> {
  const { data, error } = await supabase.rpc(RPC.portalUnmarkCompleted, {
    p_inspection_id: inspectionId,
    p_target_month: targetMonth,
    p_unit_id: unitId,
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

/** 一度に問い合わせる申請 id の数（URL の長さを抑える） */
const MEMO_CHUNK = 100;

/**
 * 申請のメモ（B12。portal_entries は返さない）。読めるのは RLS が許す申請だけ（管理者は全件、保守会社は自分の申請）。
 * 空のメモは返さない
 */
export async function fetchEntryMemos(ids: string[]): Promise<Map<string, string>> {
  const memos = new Map<string, string>();
  for (let i = 0; i < ids.length; i += MEMO_CHUNK) {
    const { data, error } = await supabase
      .from(TABLES.entries)
      .select('id, memo')
      .in('id', ids.slice(i, i + MEMO_CHUNK))
      .not('memo', 'is', null);
    if (error) throw error;
    for (const r of (data ?? []) as { id: string; memo: string | null }[]) {
      if (r.memo) memos.set(r.id, r.memo);
    }
  }
  return memos;
}
