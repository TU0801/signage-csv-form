import JSZip from 'jszip';
import { saveAs } from 'file-saver';
import type { DbEntry } from '@/types/database';

/** カスタムポスター画像をZIPでダウンロード */
export async function downloadCustomImages(entries: DbEntry[]): Promise<number> {
  const customEntries = entries.filter(
    (e) => e.poster_type === 'custom' && e.poster_image,
  );

  if (customEntries.length === 0) {
    return 0;
  }

  const zip = new JSZip();

  for (const entry of customEntries) {
    try {
      const response = await fetch(entry.poster_image!);
      const blob = await response.blob();
      const safeCode = (entry.property_code || 'unknown').replace(/[/\\:*?"<>|]/g, '_');
      const safeType = (entry.inspection_type || 'unknown').replace(/[/\\:*?"<>|]/g, '_');
      const filename = `${safeCode}_${safeType}_${entry.id.slice(0, 8)}.jpg`;
      zip.file(filename, blob);
    } catch (err) {
      console.error(`Failed to fetch image for entry ${entry.id}:`, err);
    }
  }

  const content = await zip.generateAsync({ type: 'blob' });
  saveAs(content, `custom_images_${new Date().toISOString().slice(0, 10)}.zip`);

  return customEntries.length;
}
