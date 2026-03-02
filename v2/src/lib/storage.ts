import { supabase } from './supabase';

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

/** テンプレート画像をアップロード（upsert） */
export function uploadTemplateImage(file: File, imageKey: string): Promise<string> {
  const path = `templates/${imageKey}.${getExtension(file)}`;
  return uploadImage(file, path, true, 'テンプレート画像のアップロードに失敗しました');
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

/** パスから公開URLを取得 */
export function getPublicUrl(path: string): string {
  const { data } = supabase.storage.from(STORAGE_BUCKET).getPublicUrl(path);
  return data.publicUrl;
}
