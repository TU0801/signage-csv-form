import type { DbEntry } from '@/types/database';
import { APPROVED_STATUSES, customImageBaseName, filterApprovedEntries } from './csv';
import { safePosterUrl } from './posterUrl';

/**
 * 追加画像をZIPでダウンロード（既定は承認済みのみ。v1 admin-export.js downloadCustomImages と同じ対象・ファイル名）
 * ZIP内ファイル名の拡張子を除いた部分は CSV の点検案内TPLNo と一致する（拡張子は .jpg 固定）
 * statuses: 対象にする申請の状態。'all' なら状態を問わない（承認待ちの「追加登録された画像」タブ）
 */
export async function downloadCustomImages(
  entries: DbEntry[],
  statuses: readonly DbEntry['status'][] | 'all' = APPROVED_STATUSES,
): Promise<number> {
  const targets =
    statuses === 'all'
      ? entries
      : statuses === APPROVED_STATUSES
        ? filterApprovedEntries(entries)
        : entries.filter((e) => statuses.includes(e.status));
  // このプロジェクトの poster-images の URL だけを取りに行く（画面の一覧・個別 DL と同じ safePosterUrl の判定）
  const customEntries = targets.flatMap((e) => {
    const url = e.poster_type === 'custom' ? safePosterUrl(e.poster_image) : null;
    return url ? [{ entry: e, url }] : [];
  });

  if (customEntries.length === 0) {
    return 0;
  }

  const [JSZip, { saveAs }] = await Promise.all([
    import('jszip').then((m) => m.default),
    import('file-saver'),
  ]);

  const zip = new JSZip();

  const results = await Promise.allSettled(
    customEntries.map(async ({ entry, url }) => {
      const response = await fetch(url);
      const blob = await response.blob();
      const filename = `${customImageBaseName(entry)}.jpg`;
      return { filename, blob };
    }),
  );

  for (const result of results) {
    if (result.status === 'fulfilled') {
      zip.file(result.value.filename, result.value.blob);
    }
  }

  const content = await zip.generateAsync({ type: 'blob' });
  saveAs(content, `custom_images_${new Date().toISOString().slice(0, 10)}.zip`);

  return customEntries.length;
}

/** 追加画像を1件ダウンロードする（ファイル名は ZIP の中と同じ。承認待ちの「追加登録された画像」の個別 DL） */
export async function downloadCustomImage(entry: DbEntry): Promise<void> {
  const url = safePosterUrl(entry.poster_image);
  if (!url) throw new Error(entry.poster_image ? '表示できない画像の URL です' : '追加画像がありません');
  const [{ saveAs }, response] = await Promise.all([
    import('file-saver'),
    fetch(url),
  ]);
  if (!response.ok) throw new Error(`画像を取得できませんでした（${response.status}）`);
  saveAs(await response.blob(), `${customImageBaseName(entry)}.jpg`);
}
