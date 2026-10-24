import { supabase, TABLES } from '@/lib/supabase';
import type { DbEntry } from '@/types/database';

/*
 * 承認待ちの「追加登録された画像」タブ: 貼紙で「追加」を選んでアップロードした画像の申請。
 * 読むのは signage_entries を直接（管理者は RLS で全件読める）。管理会社に開くときは範囲つきの読み方に差し替える。
 */

/** 状態の並び（承認待ち＝申請済みを先頭に） */
const STATUS_ORDER: Record<string, number> = { draft: 0, pending: 1, ready: 2, exported: 3 };

/** 追加画像（poster_type='custom' かつ画像あり）の申請。状態は問わない（signage_entries に削除済みの状態は無い）。承認待ちを先頭、次に新しい順 */
export async function fetchCustomImageEntries(): Promise<DbEntry[]> {
  const { data, error } = await supabase
    .from(TABLES.entries)
    .select('*')
    .eq('poster_type', 'custom')
    .not('poster_image', 'is', null)
    .neq('poster_image', '')
    .order('created_at', { ascending: false });
  if (error) throw error;
  return sortCustomImageEntries((data ?? []) as DbEntry[]);
}

/** 承認待ち（draft）を先頭に、同じ状態の中は新しい順 */
export function sortCustomImageEntries(entries: DbEntry[]): DbEntry[] {
  return [...entries].sort(
    (a, b) =>
      (STATUS_ORDER[a.status ?? ''] ?? 9) - (STATUS_ORDER[b.status ?? ''] ?? 9) ||
      String(b.created_at ?? '').localeCompare(String(a.created_at ?? '')),
  );
}

/** タブの件数（追加画像の申請の総数） */
export async function countCustomImageEntries(): Promise<number> {
  const { count, error } = await supabase
    .from(TABLES.entries)
    .select('id', { count: 'exact', head: true })
    .eq('poster_type', 'custom')
    .not('poster_image', 'is', null)
    .neq('poster_image', '');
  if (error) throw error;
  return count ?? 0;
}
