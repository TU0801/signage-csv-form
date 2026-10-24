import { useState, useEffect, useCallback } from 'react';
import { supabase, TABLES } from '@/lib/supabase';
import { MAX_AD_SLOTS } from '@/lib/constants';
import { uploadAdImage, deleteStorageFile } from '@/lib/storage';
import type { DbAdSlot } from '@/types/database';
import { storagePathFromPublicUrl, withCacheBuster } from '../lib/adImage';

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

/** 切り抜く前の元画像の確認（拡張子だけ。大きさは切り抜いて書き出した後の File を adImageFileError で確かめる） */
export function adImageExtensionError(file: Pick<File, 'name'>): string | null {
  return adImageFileError({ name: file.name, size: 0 });
}

/**
 * リンクURLの確認。空は可（リンクなし）。それ以外は http(s):// で始まるものだけ保存できる
 * （相対URLは開けず、javascript: 等は押した人のブラウザでスクリプトが動くため。2026-10-16 ユーザー決定で保存を止める）。
 */
export function adLinkUrlError(url: string): string | null {
  const trimmed = url.trim();
  if (!trimmed || /^https?:\/\/\S+$/i.test(trimmed)) return null;
  return 'https:// または http:// から始まるURLを入力してください';
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
   * 画像の URL には ?v=<更新時刻> を付ける（同じパスへの上書きでもブラウザ・CDN の古い画像を出さない）。
   * 拡張子が変わった（png ⇄ jpg）ときは、行を更新した後で前のファイルを消す。
   */
  // v1: js/admin-masters-ads.js saveAdSlot → js/supabase/ads.js uploadAdImage / upsertAdSlot
  const saveSlot = useCallback(
    async (slot: DbAdSlot, input: AdSlotInput) => {
      const now = Date.now();
      let imageUrl = slot.image_url;
      let staleOldPath: string | null = null;
      if (input.imageFile) {
        const uploadedUrl = await uploadAdImageV1(input.imageFile, slot.slot_index);
        imageUrl = withCacheBuster(uploadedUrl, now);
        const oldPath = storagePathFromPublicUrl(slot.image_url);
        const newPath = storagePathFromPublicUrl(uploadedUrl);
        if (oldPath && newPath && oldPath !== newPath && isSlotImagePath(oldPath, slot.slot_index)) {
          staleOldPath = oldPath;
        }
      }
      const { error: err } = await supabase
        .from(TABLES.adSlots)
        .update({
          image_url: imageUrl,
          caption: input.caption.trim(),
          link_url: input.linkUrl.trim(),
          is_active: input.isActive,
          updated_at: new Date(now).toISOString(),
        })
        .eq('slot_index', slot.slot_index);
      if (err) throw err;
      // 失敗しても保存は済んでいる（消し損ねたファイルはどの行からも参照されないだけ。deleteStorageFile がログに残す）
      if (staleOldPath) await deleteStorageFile(staleOldPath);
      await fetchSlots();
    },
    [fetchSlots],
  );

  /**
   * 枠の中身を消す（行は残す。行が無いと管理画面で枠を開けず、作り直す経路も無いため）。
   * 先に行を空・非表示にしてから、ads/slot_{n}.png・.jpg と今の画像のファイルを Storage から消す（元に戻せない）
   * （行を先に変えるので、ファイルの削除に失敗してもログイン画面が消えたファイルを指すことはない）。
   */
  const clearSlot = useCallback(
    async (slot: DbAdSlot) => {
      const { error: err } = await supabase
        .from(TABLES.adSlots)
        .update({
          image_url: null,
          caption: '',
          link_url: '',
          is_active: false,
          updated_at: new Date().toISOString(),
        })
        .eq('slot_index', slot.slot_index);
      if (err) throw err;
      const paths = new Set([`ads/slot_${slot.slot_index}.png`, `ads/slot_${slot.slot_index}.jpg`]);
      const currentPath = storagePathFromPublicUrl(slot.image_url);
      // 今の画像が ads/slot_{n} 以外の名前でも消す（ads/ の中で、他の枠が使っていないものだけ）
      const usedByOthers = slots.some(
        (s) => s.slot_index !== slot.slot_index && storagePathFromPublicUrl(s.image_url) === currentPath,
      );
      if (currentPath && currentPath.startsWith('ads/') && !usedByOthers) paths.add(currentPath);
      for (const path of paths) await deleteStorageFile(path);
      await fetchSlots();
    },
    [fetchSlots, slots],
  );

  return {
    slots,
    loading,
    error,
    refetch: fetchSlots,
    saveSlot,
    clearSlot,
  };
}

/** その枠の画像として置いたファイル（ads/slot_{n}.{拡張子}）か。他の枠や ads/ 以外のファイルは消さない */
function isSlotImagePath(path: string, slotIndex: number): boolean {
  return new RegExp(`^ads/slot_${slotIndex}\\.(png|jpe?g)$`, 'i').test(path);
}
