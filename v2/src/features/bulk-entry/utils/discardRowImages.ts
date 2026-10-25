import { useBulkStore } from '@/stores/bulkStore';
import { discardOwnPosterImages } from '@/lib/storage';
import { notHeld } from '@/lib/posterPath';
import { getStoredTemplates } from './bulkTemplates';
import type { BulkEntryRow } from '../types';

/** 行が持っている追加の貼紙画像（テンプレートの行は1枚目の画像を使わない）と、2枚目以降の貼紙の画像（修正依頼1025 D3） */
export function rowPosterImages(
  rows: readonly (Pick<BulkEntryRow, 'posterType' | 'posterImage'> & Partial<Pick<BulkEntryRow, 'extraPosters'>>)[],
): string[] {
  return rows.flatMap((r) => [
    ...(r.posterType === 'custom' && r.posterImage ? [r.posterImage] : []),
    ...(r.extraPosters ?? []).map((x) => x.image_url),
  ]);
}

/** 行がまだ持っている画像（1枚目と2枚目以降。片付けで外す側） */
function heldImages(r: Partial<Pick<BulkEntryRow, 'posterImage' | 'extraPosters'>> | null | undefined): string[] {
  if (!r) return [];
  return [r.posterImage ?? '', ...(r.extraPosters ?? []).map((x) => x.image_url)];
}

/**
 * 一括入力で使われなくなった画像を片付ける（行の削除・テンプレートの適用・詳細設定の差し替え／キャンセルの後に呼ぶ）。
 * 画面に残る行・コピー中の行・このブラウザに保存したテンプレートがまだ持っている画像は消さない
 * （複製した行は同じ URL を持つ）。消すのは自分のフォルダの、申請から参照されていない画像だけ（discardOwnPosterImages）
 */
export function discardUnheldRowImages(candidates: readonly string[]): void {
  if (candidates.length === 0) return;
  const { rows, copiedRow, userId } = useBulkStore.getState();
  const held = [
    ...rows.flatMap((r) => heldImages(r)),
    ...heldImages(copiedRow),
    ...getStoredTemplates().flatMap((t) => t.rows.flatMap((r) => heldImages(r))),
  ];
  const urls = notHeld(candidates, held);
  if (urls.length > 0) void discardOwnPosterImages(urls, userId);
}

/**
 * 行を入れ替える処理（予定の入れ直し・保守会社の切り替え）を走らせ、そのあと表から消えた行の画像を片付ける。
 * 残った行が持つ画像は discardUnheldRowImages が外すので、前の行の画像をそのまま候補に渡せばよい
 */
export function discardImagesDroppedBy(update: () => void): void {
  const before = rowPosterImages(useBulkStore.getState().rows);
  update();
  discardUnheldRowImages(before);
}
