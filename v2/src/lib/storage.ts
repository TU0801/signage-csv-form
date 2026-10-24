import { supabase, TABLES } from './supabase';
import { ownPosterPath } from './posterPath';

const STORAGE_BUCKET = 'poster-images';
export const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB
export const VALID_IMAGE_TYPES = ['image/jpeg', 'image/jpg', 'image/png'];

/** ファイル形式・サイズ検証 */
export function validateImageFile(file: File): void {
  if (!VALID_IMAGE_TYPES.includes(file.type)) {
    throw new Error('JPG, JPEG, PNG形式の画像を選択してください');
  }
  if (file.size > MAX_FILE_SIZE) {
    throw new Error('画像サイズは5MB以下にしてください');
  }
}

function getExtension(file: File): string {
  return file.type === 'image/png' ? 'png' : 'jpg';
}

async function uploadImage(
  file: File,
  path: string,
  upsert: boolean,
  errorLabel: string,
): Promise<string> {
  validateImageFile(file);
  const { data, error } = await supabase.storage
    .from(STORAGE_BUCKET)
    .upload(path, file, { contentType: file.type, upsert });
  if (error) throw new Error(`${errorLabel}: ${error.message}`);
  return getPublicUrl(data.path);
}

/** カスタムポスター画像をアップロード（ユーザーごとのディレクトリ） */
export function uploadPosterImage(file: File, userId: string): Promise<string> {
  const timestamp = Date.now();
  const random = Math.random().toString(36).substring(2, 8);
  const path = `${userId}/${timestamp}_${random}.${getExtension(file)}`;
  return uploadImage(file, path, false, '画像のアップロードに失敗しました');
}

/** 広告枠画像をアップロード（upsert） */
export function uploadAdImage(file: File, slotIndex: number): Promise<string> {
  const path = `ads/slot_${slotIndex}.${getExtension(file)}`;
  return uploadImage(file, path, true, '広告画像のアップロードに失敗しました');
}

/** Storage上のファイルを削除 */
export async function deleteStorageFile(path: string): Promise<void> {
  const { error } = await supabase.storage.from(STORAGE_BUCKET).remove([path]);
  if (error) {
    console.error('Storage delete error:', error);
  }
}

/**
 * 使われなくなった自分の貼紙画像を Storage から消す（差し替えた・テンプレートに戻した・行を消した・詳細設定をキャンセルしたとき）。
 * 消すのは自分の {userId}/ フォルダの画像で、どの申請（signage_entries.poster_image）からも参照されていないものだけ。
 * DB の DELETE ポリシーも同じ条件で守る（scripts/fix-1024-followups-orphan.sql）。
 * 失敗してもログだけ残して投げない（画面の操作は止めない）
 */
export async function discardOwnPosterImages(urls: readonly string[], userId: string | null | undefined): Promise<void> {
  try {
    const own = urls.filter((u) => ownPosterPath(u, userId));
    if (own.length === 0) return;
    const { data, error } = await supabase.from(TABLES.entries).select('poster_image').in('poster_image', own);
    if (error) throw error;
    const referenced = new Set((data ?? []).map((r: { poster_image: string | null }) => r.poster_image));
    const paths = own.filter((u) => !referenced.has(u)).map((u) => ownPosterPath(u, userId)!);
    if (paths.length === 0) return;
    const { error: removeError } = await supabase.storage.from(STORAGE_BUCKET).remove(paths);
    if (removeError) throw removeError;
  } catch (e) {
    console.warn('使われなくなった貼紙画像を消せませんでした:', e);
  }
}

/** 管理者の整理で、選んだ画像（バケット内のパス）をまとめて消す。消せたパスを返す */
export async function deletePosterObjects(paths: readonly string[]): Promise<string[]> {
  if (paths.length === 0) return [];
  const { data, error } = await supabase.storage.from(STORAGE_BUCKET).remove([...paths]);
  if (error) throw new Error(`画像を削除できませんでした: ${error.message}`);
  return (data ?? []).map((o) => o.name);
}

/** パスから公開URLを取得 */
export function getPublicUrl(path: string): string {
  const { data } = supabase.storage.from(STORAGE_BUCKET).getPublicUrl(path);
  return data.publicUrl;
}
