import { supabase, RPC, TABLES } from '@/lib/supabase';
import { getPublicUrl, validateImageFile } from '@/lib/storage';

/*
 * 貼紙ライブラリ（文字を合成しない貼紙。騒音注意・駐車禁止など。修正依頼1025 D2）。scripts/fix-1025-posters.sql
 * 画像は poster-images/library/{common|<管理会社id>}/。全社共通（management_company_id が null）は管理者が登録し、
 * 管理会社は自社分だけ登録・編集・無効化できる（RLS と Storage ポリシー）。
 * 申請の画面では poster_library_for_property（物件の管理会社の分＋全社共通）から選ぶ。選んだ画像は今の「追加」の貼紙と同じ扱い
 */

const BUCKET = 'poster-images';

/** ライブラリの1枚（申請の画面で選ぶときの形） */
export interface PosterLibraryItem {
  id: string;
  display_name: string;
  category: string;
  image_url: string;
  /** 管理会社（biz.companies.id）。null は全社共通 */
  management_company_id: string | null;
  sort_order: number;
}

/** 登録画面で扱う形（表の行） */
export interface PosterLibraryRow extends PosterLibraryItem {
  storage_path: string;
  is_active: boolean;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

/** カテゴリの候補（自由入力もできる） */
export const LIBRARY_CATEGORIES = ['注意', '禁止', 'お知らせ', '工事', '清掃', 'その他'] as const;

/** 物件の申請で選べるライブラリ（有効なものだけ。物件コードが空なら全社共通だけ） */
export async function fetchLibraryForProperty(propertyCode: string): Promise<PosterLibraryItem[]> {
  const { data, error } = await supabase.rpc(RPC.posterLibraryForProperty, { p_property_code: propertyCode || '' });
  if (error) throw error;
  return (data ?? []) as PosterLibraryItem[];
}

/** 登録画面の一覧（管理者は全部、管理会社は全社共通＋自社分。無効も含む） */
export async function fetchLibraryRows(): Promise<PosterLibraryRow[]> {
  const { data, error } = await supabase
    .from(TABLES.posterLibrary)
    .select('*')
    .order('management_company_id', { ascending: true, nullsFirst: true })
    .order('category')
    .order('sort_order')
    .order('display_name');
  if (error) throw error;
  return (data ?? []) as PosterLibraryRow[];
}

/** 置き場所のフォルダ（library/common か library/<管理会社id>） */
export function libraryFolder(companyId: string | null): string {
  return `library/${companyId ?? 'common'}`;
}

/** ライブラリの画像をアップロードする（PNG/JPG・5MB 以下。PDF は呼ぶ側で preparePosterImage を通して PNG にする） */
export async function uploadLibraryImage(file: File, companyId: string | null): Promise<{ path: string; url: string }> {
  validateImageFile(file);
  const ext = file.type === 'image/png' ? 'png' : 'jpg';
  const path = `${libraryFolder(companyId)}/${Date.now()}_${Math.random().toString(36).substring(2, 8)}.${ext}`;
  const { data, error } = await supabase.storage.from(BUCKET).upload(path, file, { contentType: file.type, upsert: false });
  if (error) throw new Error(`画像のアップロードに失敗しました: ${error.message}`);
  return { path: data.path, url: getPublicUrl(data.path) };
}

/**
 * ライブラリの画像を消す（登録に失敗した・差し替えた画像の片付け）。申請やライブラリの行から使われている画像は消さない
 * （管理者の DELETE ポリシーは条件なしなので、先に poster_library_object_in_use で確かめる。管理会社は DB 側でも止まる）。
 * 失敗はログだけ
 */
export async function discardLibraryImage(path: string): Promise<void> {
  try {
    const { data: inUse, error: checkError } = await supabase.rpc(RPC.posterLibraryObjectInUse, { p_name: path });
    if (checkError) throw checkError;
    if (inUse !== false) return;
    const { error } = await supabase.storage.from(BUCKET).remove([path]);
    if (error) throw error;
  } catch (e) {
    console.warn('ライブラリの画像を消せませんでした:', e);
  }
}

export interface LibraryInput {
  display_name: string;
  category: string;
  sort_order: number;
}

/** 新しく登録する（画像をアップロードしてから行を入れる。行が入らなければ画像を消す） */
export async function createLibraryItem(
  input: LibraryInput & { management_company_id: string | null },
  file: File,
): Promise<PosterLibraryRow> {
  const { path, url } = await uploadLibraryImage(file, input.management_company_id);
  const { data, error } = await supabase
    .from(TABLES.posterLibrary)
    .insert({ ...input, image_url: url, storage_path: path })
    .select()
    .single();
  if (error) {
    await discardLibraryImage(path);
    throw error;
  }
  return data as PosterLibraryRow;
}

/**
 * 名前・カテゴリ・並び順・有効を変える。file を渡すと画像も差し替える（新しい画像を入れてから行を更新し、前の画像は消してみる。
 * 申請から使われている画像は残る）
 */
export async function updateLibraryItem(
  row: Pick<PosterLibraryRow, 'id' | 'management_company_id' | 'storage_path'>,
  patch: Partial<LibraryInput & { is_active: boolean }>,
  file?: File,
): Promise<PosterLibraryRow> {
  const uploaded = file ? await uploadLibraryImage(file, row.management_company_id) : null;
  const { data, error } = await supabase
    .from(TABLES.posterLibrary)
    .update({ ...patch, ...(uploaded ? { image_url: uploaded.url, storage_path: uploaded.path } : {}) })
    .eq('id', row.id)
    .select()
    .single();
  if (error) {
    if (uploaded) await discardLibraryImage(uploaded.path);
    throw error;
  }
  if (uploaded) await discardLibraryImage(row.storage_path);
  return data as PosterLibraryRow;
}
