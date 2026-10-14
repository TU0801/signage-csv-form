import type { DbEntry } from '@/types/database';
import { customImageBaseName, filterApprovedEntries } from './csv';

/**
 * 追加画像をZIPでダウンロード（承認済みのみ。v1 admin-export.js downloadCustomImages と同じ対象・ファイル名）
 * ZIP内ファイル名の拡張子を除いた部分は CSV の点検案内TPLNo と一致する（拡張子は .jpg 固定）
 */
export async function downloadCustomImages(entries: DbEntry[]): Promise<number> {
  const customEntries = filterApprovedEntries(entries).filter(
    (e) => e.poster_type === 'custom' && e.poster_image,
  );

  if (customEntries.length === 0) {
    return 0;
  }

  const [JSZip, { saveAs }] = await Promise.all([
    import('jszip').then((m) => m.default),
    import('file-saver'),
  ]);

  const zip = new JSZip();

  const results = await Promise.allSettled(
    customEntries.map(async (entry) => {
      const response = await fetch(entry.poster_image!);
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
