import { supabase, TABLES } from '@/lib/supabase';
import { APPROVED_STATUSES } from '@/lib/csv';
import type { DbEntry, DbProfile } from '@/types/database';

/*
 * 管理画面のデータ一覧・データ承認で使う signage_entries の読み書き。
 * 管理者は guard_entry_approval_flow の対象外（is_active_admin）。一般ユーザーはこの画面に入れない（AdminRoute）。
 * 単一行の更新は v1 と同じく .select().single() で返す: RLS で 0 行になった空振りをエラーとして拾うため。
 */

/** 管理画面で編集できるステータス */
export type AdminEntryStatus = 'pending' | 'draft' | 'ready' | 'exported';

/** データ一覧の絞り込み（v1 admin.html #filterProperty / #filterStartDate / #filterEndDate / #filterVendor） */
export interface AdminEntryFilters {
  propertyCode: string;
  startDate: string;
  endDate: string;
  vendorName: string;
}

/** データ一覧は承認済み（ready/exported）だけ。点検開始日で期間を絞る */
// v1: js/supabase/entries.js getAllEntries（admin-entries.js loadEntries の statusArray: ['ready','exported']）
export async function fetchApprovedEntries(filters: AdminEntryFilters): Promise<DbEntry[]> {
  let query = supabase.from(TABLES.entries).select('*').order('created_at', { ascending: false });
  if (filters.propertyCode) query = query.eq('property_code', filters.propertyCode);
  if (filters.startDate) query = query.gte('inspection_start', filters.startDate);
  if (filters.endDate) query = query.lte('inspection_start', filters.endDate);
  query = query.in('status', [...APPROVED_STATUSES]);
  if (filters.vendorName) query = query.eq('vendor_name', filters.vendorName);
  const { data, error } = await query;
  if (error) throw error;
  return (data ?? []) as DbEntry[];
}

/** fetchApprovedEntries と同じ条件の件数（サイドバーの「承認済み」。v1: js/admin.js updateSidebarCounts の entries.length） */
export async function countApprovedEntries(filters: AdminEntryFilters): Promise<number> {
  let query = supabase.from(TABLES.entries).select('id', { count: 'exact', head: true });
  if (filters.propertyCode) query = query.eq('property_code', filters.propertyCode);
  if (filters.startDate) query = query.gte('inspection_start', filters.startDate);
  if (filters.endDate) query = query.lte('inspection_start', filters.endDate);
  query = query.in('status', [...APPROVED_STATUSES]);
  if (filters.vendorName) query = query.eq('vendor_name', filters.vendorName);
  const { count, error } = await query;
  if (error) throw error;
  return count ?? 0;
}

/** 承認待ち（申請済み = draft） */
// v1: js/supabase/approval.js getPendingEntries
export async function fetchPendingEntries(): Promise<DbEntry[]> {
  const { data, error } = await supabase
    .from(TABLES.entries)
    .select('*')
    .eq('status', 'draft')
    .order('created_at', { ascending: false });
  if (error) throw error;
  return (data ?? []) as DbEntry[];
}

/** 承認待ち（draft）の件数（サイドバー。v1: js/admin.js updateSidebarCounts の pendingEntries.length） */
export async function countPendingEntries(): Promise<number> {
  const { count, error } = await supabase
    .from(TABLES.entries)
    .select('id', { count: 'exact', head: true })
    .eq('status', 'draft');
  if (error) throw error;
  return count ?? 0;
}

/** 承認しようとした申請が、画面で読んだ後に直されていた（承認前の申請は保守会社が直せる。修正依頼1026 I11） */
export const STALE_ENTRY_MESSAGE = '申請が修正されました。最新の内容を確かめてから承認してください';

// v1: js/supabase/approval.js approveEntry
// expectedUpdatedAt は画面が読んだ updated_at。直された後（版が違う）なら更新せず断る（見ていない内容を承認しない）
export async function approveEntry(id: string, expectedUpdatedAt: string | null): Promise<DbEntry> {
  const base = supabase.from(TABLES.entries).update({ status: 'ready' }).eq('id', id);
  const query = expectedUpdatedAt === null ? base.is('updated_at', null) : base.eq('updated_at', expectedUpdatedAt);
  const { data, error } = await query.select();
  if (error) throw error;
  const row = (data ?? [])[0] as DbEntry | undefined;
  if (!row) throw new Error(STALE_ENTRY_MESSAGE);
  return row;
}

// v1: js/supabase/approval.js approveEntries（v1 は1回の更新。版を1件ずつ比べるので1件ずつ承認し、全件の結果を待つ）
export async function approveEntries(
  targets: { id: string; updatedAt: string | null }[],
): Promise<PromiseSettledResult<DbEntry>[]> {
  return Promise.allSettled(targets.map((t) => approveEntry(t.id, t.updatedAt)));
}

/** 却下は物理削除（理由はどこにも保存しない。v1 と同じ） */
// v1: js/supabase/approval.js rejectEntry
export async function rejectEntry(id: string): Promise<void> {
  const { error } = await supabase.from(TABLES.entries).delete().eq('id', id);
  if (error) throw error;
}

// v1: js/supabase/entries.js deleteEntry
export async function deleteEntry(id: string): Promise<void> {
  const { error } = await supabase.from(TABLES.entries).delete().eq('id', id);
  if (error) throw error;
}

// v1: js/supabase/entries.js updateEntriesStatusBulk
export async function updateEntriesStatusBulk(
  ids: string[],
  status: AdminEntryStatus,
): Promise<DbEntry[]> {
  const { data, error } = await supabase
    .from(TABLES.entries)
    .update({ status })
    .in('id', ids)
    .select();
  if (error) throw error;
  return (data ?? []) as DbEntry[];
}

/** 管理画面の編集で送る列（表示設定とステータスだけ。updated_at は DB トリガーが付ける） */
export type EntryDisplayUpdates = Pick<
  DbEntry,
  | 'display_start_date'
  | 'display_start_time'
  | 'display_end_date'
  | 'display_end_time'
  | 'display_duration'
  | 'poster_position'
> & { status?: AdminEntryStatus };

// v1: js/supabase/entries.js updateEntry（admin-entry-edit.js saveEditedEntry から）
export async function updateEntryDisplaySettings(
  id: string,
  updates: EntryDisplayUpdates,
): Promise<DbEntry> {
  const { data, error } = await supabase
    .from(TABLES.entries)
    .update(updates)
    .eq('id', id)
    .select()
    .single();
  if (error) throw error;
  return data as DbEntry;
}

/** 登録者のメールアドレス表示用 */
// v1: js/supabase/users.js getAllProfiles（admin.js getUserEmail）
export async function fetchProfileEmails(): Promise<Map<string, string>> {
  const { data, error } = await supabase.from(TABLES.profiles).select('id, email');
  if (error) throw error;
  return new Map(
    ((data ?? []) as Pick<DbProfile, 'id' | 'email'>[]).map((p) => [p.id, p.email]),
  );
}

/**
 * 設定 display_time_default（setting_value は text）。読めなければ undefined を返し、呼び出し側で 6 秒にする
 */
// v1: js/admin-settings.js loadAppSettings / getAppSettings().display_time_default
export async function fetchDisplayTimeDefault(): Promise<string | undefined> {
  const { data, error } = await supabase
    .from(TABLES.settings)
    .select('setting_value')
    .eq('setting_key', 'display_time_default')
    .maybeSingle();
  if (error) return undefined;
  return (data as { setting_value: string } | null)?.setting_value ?? undefined;
}

// v1: js/error-handler.js translateError
export function translateError(errorMessage: unknown): string {
  const translations: [string, string][] = [
    ['duplicate key', 'すでに登録されています'],
    ['unique constraint', 'すでに登録されています'],
    ['foreign key', '関連データが存在しません'],
    ['not found', 'データが見つかりません'],
    ['permission denied', '権限がありません'],
    ['authentication', '認証エラーです'],
    ['network', 'ネットワークエラーです'],
    ['timeout', 'タイムアウトしました'],
    ['invalid', '入力値が不正です'],
    ['required', '必須項目が入力されていません'],
  ];
  const message = String(errorMessage || '').toLowerCase();
  for (const [en, ja] of translations) {
    if (message.includes(en)) return ja;
  }
  return '操作に失敗しました';
}

const JAPANESE = /[぀-ヿ一-鿿]/;

/**
 * DB エラーの理由を日本語で返す。guard_entry_approval_flow（42501）などの RAISE は日本語の文言を持つのでそのまま使い、
 * 英語の文言は v1 translateError で置き換える。
 * 0 行の更新（RLS で空振り・既に削除済み）は PGRST116 になる
 */
export function entryErrorReason(error: unknown): string {
  const e = (error ?? {}) as { message?: string; code?: string };
  const message = e.message ?? String(error ?? '');
  if (JAPANESE.test(message)) return message;
  if (e.code === 'PGRST116') return 'データが見つかりません（他の操作で変更・削除された可能性があります）';
  if (e.code === '42501') return '権限がありません';
  return translateError(message);
}
