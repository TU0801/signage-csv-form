// supabase/storage.js - 画像アップロード/削除

import { supabase, SUPABASE_URL, STORAGE_BUCKET } from './client.js';
import { getUser } from './auth.js';

function base64ToBlob(base64Data) {
  const [header, data] = base64Data.split(',');
  const mimeMatch = header.match(/data:(.*?);/);
  const mimeType = mimeMatch ? mimeMatch[1] : 'image/jpeg';
  const byteCharacters = atob(data);
  const byteNumbers = new Array(byteCharacters.length);
  for (let i = 0; i < byteCharacters.length; i++) {
    byteNumbers[i] = byteCharacters.charCodeAt(i);
  }
  const byteArray = new Uint8Array(byteNumbers);
  return new Blob([byteArray], { type: mimeType });
}

export async function uploadPosterImage(base64Data) {
  if (!base64Data) return null;
  const user = await getUser();
  if (!user) throw new Error('ログインが必要です');

  const timestamp = Date.now();
  const random = Math.random().toString(36).substring(2, 8);
  const extension = base64Data.includes('image/png') ? 'png' : 'jpg';
  const fileName = `${user.id}/${timestamp}_${random}.${extension}`;
  const blob = base64ToBlob(base64Data);

  const { data, error } = await supabase.storage.from(STORAGE_BUCKET).upload(fileName, blob, { contentType: blob.type, upsert: false });
  if (error) { console.error('Storage upload error:', error); throw new Error('画像のアップロードに失敗しました: ' + error.message); }

  const { data: urlData } = supabase.storage.from(STORAGE_BUCKET).getPublicUrl(data.path);
  return urlData.publicUrl;
}

export async function deletePosterImage(imageUrl) {
  if (!imageUrl) return;
  const bucketUrl = `${SUPABASE_URL}/storage/v1/object/public/${STORAGE_BUCKET}/`;
  if (!imageUrl.startsWith(bucketUrl)) return;
  const path = imageUrl.replace(bucketUrl, '');
  const { error } = await supabase.storage.from(STORAGE_BUCKET).remove([path]);
  if (error) console.error('Storage delete error:', error);
}

export async function uploadTemplateImageFile(file, imageKey) {
  if (!file) return null;
  const user = await getUser();
  if (!user) throw new Error('ログインが必要です');

  const extension = file.name.split('.').pop().toLowerCase();
  if (!['png', 'jpg', 'jpeg'].includes(extension)) throw new Error('PNG、JPG形式の画像のみアップロードできます');
  if (file.size > 5 * 1024 * 1024) throw new Error('ファイルサイズは5MB以下にしてください');

  const fileName = `templates/${imageKey}.${extension}`;
  const { data, error } = await supabase.storage.from(STORAGE_BUCKET).upload(fileName, file, { contentType: file.type, upsert: true });
  if (error) { console.error('Template image upload error:', error); throw new Error('画像のアップロードに失敗しました: ' + error.message); }

  const { data: urlData } = supabase.storage.from(STORAGE_BUCKET).getPublicUrl(data.path);
  return urlData.publicUrl;
}

export async function deleteTemplateImageFile(imageUrl) {
  if (!imageUrl) return;
  const bucketUrl = `${SUPABASE_URL}/storage/v1/object/public/${STORAGE_BUCKET}/`;
  if (!imageUrl.startsWith(bucketUrl)) return;
  const path = imageUrl.replace(bucketUrl, '');
  const { error } = await supabase.storage.from(STORAGE_BUCKET).remove([path]);
  if (error) console.error('Template image delete error:', error);
}
