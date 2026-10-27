import { useEffect, useState } from 'react';
import type { DbInspectionReport } from '@/types/portal';
import { Spinner } from '@/components/ui/Spinner';
import { downloadReportBlob } from '@/lib/api/portal';
import { entryErrorReason } from '@/lib/api/admin-entries';
import { FilePreview } from './FilePreview';

type StoredReport = Pick<
  DbInspectionReport,
  'id' | 'storage_path' | 'storage_backend' | 'file_name' | 'mime'
>;

/**
 * 登録済みの報告書のプレビュー（報告書の再提出・編集。修正依頼1027(1)(2)）。
 * Storage から本体を取り出し、選んだファイルと同じ FilePreview で出す（建物の取り違えに気づけるように）
 */
export function StoredReportPreview({ report }: { report: StoredReport | null }) {
  const [loaded, setLoaded] = useState<{
    id: string;
    file: File | null;
    error: string | null;
  } | null>(null);
  const id = report?.id ?? null;

  useEffect(() => {
    if (!report) return;
    let cancelled = false;
    downloadReportBlob(report)
      .then((blob) => {
        if (cancelled) return;
        const file = new File([blob], report.file_name, {
          type: report.mime || blob.type || 'application/pdf',
        });
        setLoaded({ id: report.id, file, error: null });
      })
      .catch((err: unknown) => {
        if (!cancelled) setLoaded({ id: report.id, file: null, error: entryErrorReason(err) });
      });
    return () => {
      cancelled = true;
    };
    // 同じ報告書なら取り直さない（一覧の読み直しで別のオブジェクトになっても）
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  if (!report) return <FilePreview file={null} />;
  const current = loaded?.id === report.id ? loaded : null;
  if (current?.error) {
    return (
      <div className="flex min-h-[16rem] items-center justify-center rounded border border-gray-200 bg-gray-50 p-2 text-xs text-red-600">
        プレビューを表示できませんでした（{current.error}）
      </div>
    );
  }
  if (!current?.file) {
    return (
      <div className="flex min-h-[16rem] items-center justify-center gap-1 rounded border border-gray-200 bg-gray-50 p-2 text-xs text-gray-500">
        <Spinner size="sm" />
        登録済みのファイルを読み込んでいます…
      </div>
    );
  }
  return <FilePreview file={current.file} />;
}
