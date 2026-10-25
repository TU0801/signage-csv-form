import type { DbEntry } from '@/types/database';
import { APPROVED_STATUSES, customImageBaseName, filterApprovedEntries } from './csv';
import { customImageFiles, type CustomImageFile } from './customImageFiles';
import { safePosterUrl } from './posterUrl';

export { customImageFiles, type CustomImageFile };

/**
 * 追加画像のファイル名の拡張子（png / jpg）。URL の拡張子に合わせ、URL に無ければ中身の先頭バイトで見分ける。
 * どちらでも分からなければ jpg（今までと同じ）。.jpg 固定だと PNG の貼紙が .jpg の名前になっていた（修正依頼1024 本番確認 ④）
 */
export async function imageExtension(url: string, blob: Blob): Promise<'png' | 'jpg'> {
  const path = url.split(/[?#]/)[0] ?? '';
  const fromUrl = /\.(png|jpe?g)$/i.exec(path.slice(path.lastIndexOf('/') + 1))?.[1]?.toLowerCase();
  if (fromUrl) return fromUrl === 'png' ? 'png' : 'jpg';
  const head = new Uint8Array(await blob.slice(0, 4).arrayBuffer());
  const isPng = head[0] === 0x89 && head[1] === 0x50 && head[2] === 0x4e && head[3] === 0x47;
  return isPng ? 'png' : 'jpg';
}

/**
 * 追加画像をZIPでダウンロード（既定は承認済みのみ。v1 admin-export.js downloadCustomImages と同じ対象・ファイル名）
 * ZIP内ファイル名の拡張子を除いた部分は CSV の点検案内TPLNo と一致する（拡張子は imageExtension で中身に合わせる）
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
  // このプロジェクトの poster-images の URL だけを取りに行く（画面の一覧・個別 DL と同じ safePosterUrl の判定）。2枚目以降の貼紙も入れる
  const files = targets.flatMap((e) => customImageFiles(e));

  if (files.length === 0) {
    return 0;
  }

  const [JSZip, { saveAs }] = await Promise.all([
    import('jszip').then((m) => m.default),
    import('file-saver'),
  ]);

  const zip = new JSZip();

  const results = await Promise.allSettled(
    files.map(async ({ url, baseName }) => {
      const response = await fetch(url);
      const blob = await response.blob();
      const filename = `${baseName}.${await imageExtension(url, blob)}`;
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

  return files.length;
}

/**
 * 追加画像を1件ダウンロードする（ファイル名は ZIP の中と同じ。承認待ちの「追加登録された画像」の個別 DL）。
 * file を渡すとその1枚（2枚目以降の貼紙）、渡さなければ1枚目の追加画像
 */
export async function downloadCustomImage(entry: DbEntry, file?: CustomImageFile): Promise<void> {
  const target = file ?? (() => {
    const url = safePosterUrl(entry.poster_image);
    if (!url) throw new Error(entry.poster_image ? '表示できない画像の URL です' : '追加画像がありません');
    return { url, baseName: customImageBaseName(entry) };
  })();
  const [{ saveAs }, response] = await Promise.all([
    import('file-saver'),
    fetch(target.url),
  ]);
  if (!response.ok) throw new Error(`画像を取得できませんでした（${response.status}）`);
  const blob = await response.blob();
  saveAs(blob, `${target.baseName}.${await imageExtension(target.url, blob)}`);
}
