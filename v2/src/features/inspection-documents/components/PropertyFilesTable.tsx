import type { DbPropertyFile } from '@/types/portal';
import { Badge } from '@/components/ui/Badge';
import { cn } from '@/lib/utils';
import { formatDate } from '@/features/inspection-portal/lib/schedule';
import { formatBytes, formatDateTimeJst } from '../lib/documents';
import { propertyFileCategoryLabel } from '../lib/propertyFiles';

export type PropertyFileAction = 'open' | 'download' | 'delete';

interface PropertyFilesTableProps {
  files: DbPropertyFile[];
  canDelete: (file: DbPropertyFile) => boolean;
  busyId: string | null;
  onAction: (file: DbPropertyFile, action: PropertyFileAction) => void;
}

const TH = 'whitespace-nowrap px-1.5 py-1 text-left font-medium text-gray-600';
const TD = 'px-1.5 py-0.5 align-top';
const NAME = 'max-w-32 truncate 2xl:max-w-48';
const LINK = 'text-blue-700 hover:underline disabled:text-gray-400 disabled:no-underline';

/** その他ファイル（見積書・請求書など）の表。点検報告書の表の下に、ツリーの選択と検索で絞って出す */
export function PropertyFilesTable({ files, canDelete, busyId, onAction }: PropertyFilesTableProps) {
  return (
    <table className="w-full border-collapse text-xs" aria-label="その他ファイル">
      <thead className="bg-gray-50">
        <tr className="border-b border-gray-200">
          <th className={TH}>区分</th>
          <th className={TH}>ファイル名</th>
          <th className={TH}>建物</th>
          <th className={TH}>書類の日付</th>
          <th className={TH}>アップロード</th>
          <th className={TH}>メモ</th>
          <th className={TH}>登録日時</th>
          <th className={TH}>サイズ</th>
          <th className={TH}>操作</th>
        </tr>
      </thead>
      <tbody>
        {files.map((f) => {
          const busy = busyId === f.id;
          const deleted = f.status === 'deleted';
          return (
            <tr key={f.id} className={cn('border-b border-gray-100', deleted && 'text-gray-400')} data-testid={`property-file-${f.id}`}>
              <td className={TD}>
                <Badge variant={deleted ? 'default' : 'primary'}>{propertyFileCategoryLabel(f)}</Badge>
                {deleted && <span className="ml-1">削除済み</span>}
              </td>
              <td className={TD}>
                <div className="max-w-64 truncate" title={f.file_name}>
                  {f.file_name}
                </div>
              </td>
              <td className={TD}>
                <div className={NAME} title={`${f.property_name}（${f.property_code}）`}>
                  {f.property_name}
                </div>
              </td>
              <td className={cn(TD, 'whitespace-nowrap')}>{formatDate(f.doc_date)}</td>
              <td className={TD}>
                <div className={NAME} title={f.vendor_name ?? ''}>
                  {f.vendor_name ?? ''}
                </div>
              </td>
              <td className={TD}>
                <div className="max-w-40 truncate" title={f.note ?? ''}>
                  {f.note ?? ''}
                </div>
              </td>
              <td className={cn(TD, 'whitespace-nowrap')}>{formatDateTimeJst(f.created_at)}</td>
              <td className={cn(TD, 'whitespace-nowrap')}>{formatBytes(f.size_bytes)}</td>
              <td className={cn(TD, 'whitespace-nowrap')}>
                <span className="flex gap-2">
                  <button type="button" className={LINK} disabled={busy || deleted} onClick={() => onAction(f, 'open')}>
                    開く
                  </button>
                  <button type="button" className={LINK} disabled={busy || deleted} onClick={() => onAction(f, 'download')}>
                    ダウンロード
                  </button>
                  {canDelete(f) && (
                    <button
                      type="button"
                      className="text-red-600 hover:underline disabled:text-gray-400"
                      disabled={busy}
                      onClick={() => onAction(f, 'delete')}
                    >
                      削除
                    </button>
                  )}
                </span>
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}
