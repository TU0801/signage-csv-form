import type { DbInspectionReport } from '@/types/portal';
import { downloadReportBlob } from '@/lib/api/portal';
import { buildZipPaths } from './documents';

/** 同時に取り出す数。多すぎると署名やダウンロードが詰まり、少ないと件数が多いときに遅い */
const CONCURRENCY = 4;

export interface ZipResult {
  added: number;
  /** 取り出せなかった・保管庫へ移した版の表示名 */
  failed: string[];
}

/**
 * 選んだ報告書を ZIP にして保存する。保管庫へ移した版（storage_backend が supabase 以外）は取り出せないので飛ばす。
 * jszip・file-saver は使うときだけ読み込む（初回表示を重くしない）
 */
export async function downloadReportsZip(
  reports: DbInspectionReport[],
  { keepHierarchy, zipName, onProgress }: { keepHierarchy: boolean; zipName: string; onProgress?: (done: number, total: number) => void },
): Promise<ZipResult> {
  const [JSZip, { saveAs }] = await Promise.all([import('jszip').then((m) => m.default), import('file-saver')]);
  const zip = new JSZip();
  const paths = buildZipPaths(reports, keepHierarchy);
  const failed: string[] = [];
  let added = 0;
  let done = 0;
  let next = 0;
  onProgress?.(0, reports.length);

  const worker = async () => {
    while (next < reports.length) {
      const i = next++;
      const report = reports[i]!;
      try {
        if (report.storage_backend !== 'supabase') throw new Error('archived');
        zip.file(paths[i]!, await downloadReportBlob(report));
        added++;
      } catch {
        failed.push(report.file_name);
      }
      done++;
      onProgress?.(done, reports.length);
    }
  };
  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, reports.length) }, worker));

  if (added > 0) {
    const blob = await zip.generateAsync({ type: 'blob' });
    saveAs(blob, zipName);
  }
  return { added, failed };
}
