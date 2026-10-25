import { supabase, RPC, TABLES } from '@/lib/supabase';
import type { DbEntry } from '@/types/database';

/*
 * 承認待ちの「追加登録された画像」タブ: 貼紙で「追加」を選んでアップロードした画像の申請。
 * 読むのは signage_entries を直接（管理者は RLS で全件読める）。管理会社に開くときは範囲つきの読み方に差し替える。
 */

/**
 * 追加画像のある申請: 1枚目が追加の貼紙（画像あり）か、2枚目以降の貼紙（extra_posters）がある申請（修正依頼1025 D3）
 */
const HAS_CUSTOM_IMAGE = 'and(poster_type.eq.custom,poster_image.not.is.null,poster_image.neq.),extra_posters.neq.[]';

/** 状態の並び（承認待ち＝申請済みを先頭に） */
const STATUS_ORDER: Record<string, number> = { draft: 0, pending: 1, ready: 2, exported: 3 };

/** 追加画像（poster_type='custom' かつ画像あり、または2枚目以降の貼紙あり）の申請。状態は問わない（signage_entries に削除済みの状態は無い）。承認待ちを先頭、次に新しい順 */
export async function fetchCustomImageEntries(): Promise<DbEntry[]> {
  const { data, error } = await supabase
    .from(TABLES.entries)
    .select('*')
    .or(HAS_CUSTOM_IMAGE)
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
    .or(HAS_CUSTOM_IMAGE);
  if (error) throw error;
  return count ?? 0;
}

/** 使われていない貼紙画像（poster-images の利用者フォルダにあり、どの申請からも参照されず、作成から7日以上たったもの） */
export interface OrphanPosterImage {
  /** バケット内のパス（{userId}/{ファイル名}） */
  name: string;
  size: number;
  mimetype: string | null;
  created_at: string;
  owner_id: string | null;
  owner_email: string | null;
  owner_company: string | null;
}

/** 使われていない貼紙画像の一覧（管理者だけが呼べる RPC。古い順） */
export async function fetchOrphanPosterImages(): Promise<OrphanPosterImage[]> {
  const { data, error } = await supabase.rpc(RPC.orphanPosterImages);
  if (error) throw error;
  return ((data ?? []) as OrphanPosterImage[]).map((r) => ({ ...r, size: Number(r.size) || 0 }));
}

/** バイト数を KB / MB で（一覧の合計・各行のサイズ） */
export function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}
