import { supabase } from './supabase';

const STORAGE_BUCKET = 'poster-images';
const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB
const VALID_TYPES = ['image/jpeg', 'image/jpg', 'image/png'];

function validateImageFile(file: File): void {
  if (!VALID_TYPES.includes(file.type)) {
    throw new Error('JPG, JPEG, PNG形式の画像を選択してください');
  }
  if (file.size > MAX_FILE_SIZE) {
    throw new Error('画像サイズは5MB以下にしてください');
  }
}

function getExtension(file: File): string {
  return file.type === 'image/png' ? 'png' : 'jpg';
}

/** カスタムポスター画像をアップロード（ユーザーごとのディレクトリ） */
export async function uploadPosterImage(file: File, userId: string): Promise<string> {
  validateImageFile(file);
  const timestamp = Date.now();
  const random = Math.random().toString(36).substring(2, 8);
  const ext = getExtension(file);
  const path = `${userId}/${timestamp}_${random}.${ext}`;

  const { data, error } = await supabase.storage
    .from(STORAGE_BUCKET)
    .upload(path, file, { contentType: file.type, upsert: false });
  if (error) throw new Error('画像のアップロードに失敗しました: ' + error.message);

  return getPublicUrl(data.path);
}

/** テンプレート画像をアップロード（upsert） */
export async function uploadTemplateImage(file: File, imageKey: string): Promise<string> {
  validateImageFile(file);
  const ext = getExtension(file);
  const path = `templates/${imageKey}.${ext}`;

  const { data, error } = await supabase.storage
    .from(STORAGE_BUCKET)
    .upload(path, file, { contentType: file.type, upsert: true });
  if (error) throw new Error('テンプレート画像のアップロードに失敗しました: ' + error.message);

  return getPublicUrl(data.path);
}

/** 広告枠画像をアップロード（upsert） */
export async function uploadAdImage(file: File, slotIndex: number): Promise<string> {
  validateImageFile(file);
  const ext = getExtension(file);
  const path = `ads/slot_${slotIndex}.${ext}`;

  const { data, error } = await supabase.storage
    .from(STORAGE_BUCKET)
    .upload(path, file, { contentType: file.type, upsert: true });
  if (error) throw new Error('広告画像のアップロードに失敗しました: ' + error.message);

  return getPublicUrl(data.path);
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
