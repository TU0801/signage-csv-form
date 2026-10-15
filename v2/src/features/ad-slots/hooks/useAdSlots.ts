import { useState, useEffect, useCallback } from 'react';
import { supabase, TABLES } from '@/lib/supabase';
import { MAX_AD_SLOTS } from '@/lib/constants';
import { uploadAdImage } from '@/lib/storage';
import type { DbAdSlot } from '@/types/database';

export interface AdSlotInput {
  /** 差し替える画像。無ければ今の image_url のまま */
  imageFile?: File | null;
  caption: string;
  linkUrl: string;
  isActive: boolean;
}

/** v1 と同じ上限（5MB） */
const AD_IMAGE_MAX_BYTES = 5 * 1024 * 1024;
const AD_IMAGE_EXTENSIONS = ['png', 'jpg', 'jpeg'];
/** lib/storage.ts uploadAdImage がアップロード失敗時に付ける前置き */
const SHARED_UPLOAD_ERROR_PREFIX = '広告画像のアップロードに失敗しました';

/**
 * 広告画像の拡張子・サイズの確認（v1 の文言）。問題なければ null。
 * 保存時だけでなく、ファイルを選んだ時点でも欄の下に出すために分けている。
 */
export function adImageFileError(file: Pick<File, 'name' | 'size'>): string | null {
  const extension = (file.name.split('.').pop() ?? '').toLowerCase();
  if (!AD_IMAGE_EXTENSIONS.includes(extension)) return 'PNG、JPG形式の画像のみアップロードできます';
  if (file.size > AD_IMAGE_MAX_BYTES) return 'ファイルサイズは5MB以下にしてください';
  return null;
}

/**
 * リンクURLの書式の確認。空は可（リンクなし）。http(s):// で始まらないとログイン画面で相対URLになり開けない。
 */
export function adLinkUrlError(url: string): string | null {
  const trimmed = url.trim();
  if (!trimmed || /^https?:\/\/\S+$/i.test(trimmed)) return null;
  return 'https:// または http:// から始まるURLを入力してください';
}

/**
 * 保存を止めるリンク。javascript: 等はログイン画面で押した人のブラウザでスクリプトが動くので保存させない
 * （ほかの書式は adLinkUrlError の警告だけで保存できる）。
 */
export function adLinkUrlBlocked(url: string): boolean {
  return /^\s*(javascript|data|vbscript):/i.test(url);
}

/**
 * 広告画像を v1 と同じ確認・文言でアップロードする（共有の lib/storage.ts は文言が v1 と違うため包む）。
 * 拡張子・サイズを先に v1 の文言で断り、アップロード失敗は v1 の前置きに置き換える。
 */
// v1: js/supabase/ads.js uploadAdImage
export async function uploadAdImageV1(file: File, slotIndex: number): Promise<string> {
  const fileError = adImageFileError(file);
  if (fileError) throw new Error(fileError);
  return uploadAdImage(file, slotIndex).catch((err: unknown) => {
    if (err instanceof Error && err.message.startsWith(SHARED_UPLOAD_ERROR_PREFIX)) {
      const v1Error = new Error(
        '画像のアップロードに失敗しました' + err.message.slice(SHARED_UPLOAD_ERROR_PREFIX.length),
      );
      throw Object.assign(v1Error, { cause: err });
    }
    throw err;
  });
}

export function useAdSlots({ activeOnly = false } = {}) {
  const [slots, setSlots] = useState<DbAdSlot[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // v1: js/supabase/ads.js getAdSlots
  const fetchSlots = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      let query = supabase
        .from(TABLES.adSlots)
        .select('*')
        .order('slot_index');
      if (activeOnly) {
        query = query.eq('is_active', true);
      }
      const { data, error: err } = await query;
      if (err) throw err;
      // 使う枠は 1〜MAX_AD_SLOTS だけ（v1: login.html / admin-masters-ads.js）
      setSlots(((data ?? []) as DbAdSlot[]).filter((s) => s.slot_index <= MAX_AD_SLOTS));
    } catch (err) {
      console.error('広告枠読み込みエラー:', err);
      setError(err instanceof Error ? err.message : '広告枠の読み込みに失敗しました');
    } finally {
      setLoading(false);
    }
  }, [activeOnly]);

  useEffect(() => {
    fetchSlots();
  }, [fetchSlots]);

  /**
   * 1枠を保存する。画像を選んでいれば先に poster-images の ads/slot_{n}.{拡張子} へ上書きアップロードし、
   * 画像・キャプション・リンク・表示をまとめて UPDATE する（枠の行は DB に既にあり、INSERT はしない）。
   */
  // v1: js/admin-masters-ads.js saveAdSlot → js/supabase/ads.js uploadAdImage / upsertAdSlot
  const saveSlot = useCallback(
    async (slot: DbAdSlot, input: AdSlotInput) => {
      let imageUrl = slot.image_url;
      if (input.imageFile) {
        imageUrl = await uploadAdImageV1(input.imageFile, slot.slot_index);
      }
      const { error: err } = await supabase
        .from(TABLES.adSlots)
        .update({
          image_url: imageUrl,
          caption: input.caption.trim(),
          link_url: input.linkUrl.trim(),
          is_active: input.isActive,
          updated_at: new Date().toISOString(),
        })
        .eq('slot_index', slot.slot_index);
      if (err) throw err;
      await fetchSlots();
    },
    [fetchSlots],
  );

  return {
    slots,
    loading,
    error,
    refetch: fetchSlots,
    saveSlot,
  };
}
