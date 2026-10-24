import { useBulkStore } from '@/stores/bulkStore';
import { discardOwnPosterImages } from '@/lib/storage';
import { notHeld } from '@/lib/posterPath';
import { getStoredTemplates } from './bulkTemplates';
import type { BulkEntryRow } from '../types';

/** 行が持っている追加の貼紙画像（テンプレートの行は画像を使わない） */
export function rowPosterImages(rows: readonly Pick<BulkEntryRow, 'posterType' | 'posterImage'>[]): string[] {
  return rows.filter((r) => r.posterType === 'custom' && r.posterImage).map((r) => r.posterImage);
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
    ...rows.map((r) => r.posterImage),
    copiedRow?.posterImage,
    ...getStoredTemplates().flatMap((t) => t.rows.map((r) => r.posterImage)),
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
