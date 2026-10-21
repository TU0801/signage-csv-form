import { supabase, TABLES } from '@/lib/supabase';
import type { DbEntry } from '@/types/database';
import type { ResubmitPatch } from './applyForm';

/*
 * 差戻された申請の読み直しと再申請。portal_entries は一覧用の列しか返さないので、直すときは行全体を読む。
 * 読み書きできるのは自分の申請（管理者は全件）。RLS で外れた UPDATE はエラーにならず 0 行になるので、行数で確かめる。
 */

export async function fetchEntryForEdit(id: string): Promise<DbEntry> {
  const { data, error } = await supabase.from(TABLES.entries).select('*').eq('id', id).maybeSingle();
  if (error) throw error;
  if (!data) throw new Error('この申請は読み込めません（ほかの方が作成した申請は、作成した方か管理者が修正します）');
  return data as DbEntry;
}

/** 差戻し（pending）の行を直して申請済み（draft）へ戻す */
export async function resubmitEntry(id: string, patch: ResubmitPatch): Promise<DbEntry> {
  const { data, error } = await supabase.from(TABLES.entries).update(patch).eq('id', id).select();
  if (error) throw error;
  const row = (data ?? [])[0];
  if (!row) throw new Error('再申請できませんでした（申請が見つからないか、変更の権限がありません）');
  return row as DbEntry;
}
