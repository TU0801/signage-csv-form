// supabase/ads.js - 広告枠管理

import { supabase } from './client.js';
import { getUser } from './auth.js';

const SUPABASE_URL = window.SUPABASE_URL || 'YOUR_SUPABASE_URL';
const STORAGE_BUCKET = 'poster-images';

export async function getAdSlots() {
  const { data, error } = await supabase.from('signage_ad_slots').select('*').order('slot_index');
  if (error) throw error;
  return data;
}

export async function upsertAdSlot(slotIndex, { imageUrl, caption, linkUrl, isActive }) {
  const { error } = await supabase.from('signage_ad_slots')
    .update({ image_url: imageUrl, caption, link_url: linkUrl, is_active: isActive, updated_at: new Date().toISOString() })
    .eq('slot_index', slotIndex);
  if (error) throw error;
}

export async function uploadAdImage(file, slotIndex) {
  if (!file) return null;
  const user = await getUser();
  if (!user) throw new Error('ログインが必要です');

  const extension = file.name.split('.').pop().toLowerCase();
  if (!['png', 'jpg', 'jpeg'].includes(extension)) throw new Error('PNG、JPG形式の画像のみアップロードできます');
  if (file.size > 5 * 1024 * 1024) throw new Error('ファイルサイズは5MB以下にしてください');

  const fileName = `ads/slot_${slotIndex}.${extension}`;
  const { data, error } = await supabase.storage.from(STORAGE_BUCKET).upload(fileName, file, { contentType: file.type, upsert: true });
  if (error) { console.error('Ad image upload error:', error); throw new Error('画像のアップロードに失敗しました: ' + error.message); }

  const { data: urlData } = supabase.storage.from(STORAGE_BUCKET).getPublicUrl(data.path);
  return urlData.publicUrl;
}

export async function deleteAdImage(imageUrl) {
  if (!imageUrl) return;
  const bucketUrl = `${SUPABASE_URL}/storage/v1/object/public/${STORAGE_BUCKET}/`;
  if (!imageUrl.startsWith(bucketUrl)) return;
  const path = imageUrl.replace(bucketUrl, '');
  const { error } = await supabase.storage.from(STORAGE_BUCKET).remove([path]);
  if (error) console.error('Ad image delete error:', error);
}
