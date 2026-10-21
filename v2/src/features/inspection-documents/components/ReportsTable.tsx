import type { DbInspectionReport } from '@/types/portal';
import { Badge } from '@/components/ui/Badge';
import { cn } from '@/lib/utils';
import {
  REPORT_STATUS_LABELS,
  formatBytes,
  formatDateTimeJst,
  type ReportPermissions,
} from '../lib/documents';
import { ReportRowActions, type ReportAction } from './ReportRowActions';

const STATUS_VARIANT = {
  submitted: 'primary',
  accepted: 'success',
  returned: 'danger',
  superseded: 'default',
  deleted: 'default',
} as const;

interface ReportsTableProps {
  reports: DbInspectionReport[];
  selected: Set<string>;
  onToggle: (id: string) => void;
  onToggleAll: (checked: boolean) => void;
  permissionsOf: (report: DbInspectionReport) => ReportPermissions;
  busyId: string | null;
  onAction: (report: DbInspectionReport, action: ReportAction) => void;
}

const TH = 'whitespace-nowrap px-1.5 py-1 text-left font-medium text-gray-600';
const TD = 'px-1.5 py-0.5 align-top';

export function ReportsTable({
  reports,
  selected,
  onToggle,
  onToggleAll,
  permissionsOf,
  busyId,
  onAction,
}: ReportsTableProps) {
  const allChecked = reports.length > 0 && reports.every((r) => selected.has(r.id));
  return (
    <table className="w-full border-collapse text-xs">
      <thead className="sticky top-0 z-[1] bg-gray-50">
        <tr className="border-b border-gray-200">
          <th className={TH}>
            <input
              type="checkbox"
              aria-label="表示中をすべて選択"
              checked={allChecked}
              onChange={(e) => onToggleAll(e.target.checked)}
            />
          </th>
          <th className={TH}>ファイル名</th>
          <th className={TH}>建物</th>
          <th className={TH}>点検種別</th>
          <th className={TH}>実施日</th>
          <th className={TH}>対象月</th>
          <th className={TH}>保守会社</th>
          <th className={TH}>状態</th>
          <th className={TH}>提出日時</th>
          <th className={cn(TH, 'text-right')}>サイズ</th>
          <th className={TH}>操作</th>
        </tr>
      </thead>
      <tbody>
        {reports.map((r) => (
          <tr
            key={r.id}
            className={cn(
              'border-b border-gray-100 hover:bg-gray-50',
              (r.status === 'deleted' || r.status === 'superseded') && 'text-gray-400',
            )}
          >
            <td className={TD}>
              <input
                type="checkbox"
                aria-label={`${r.file_name} を選択`}
                checked={selected.has(r.id)}
                onChange={() => onToggle(r.id)}
              />
            </td>
            <td className={cn(TD, 'max-w-72 break-all')}>
              {r.file_name}
              {r.note && <div className="text-gray-500">メモ: {r.note}</div>}
            </td>
            <td className={cn(TD, 'max-w-40')}>{r.property_name}</td>
            <td className={cn(TD, 'max-w-32')}>{r.inspection_type_label}</td>
            <td className={cn(TD, 'whitespace-nowrap')}>{r.performed_on}</td>
            <td className={cn(TD, 'whitespace-nowrap')}>{r.target_month?.slice(0, 7) ?? ''}</td>
            <td className={cn(TD, 'max-w-32')}>{r.vendor_name ?? ''}</td>
            <td className={TD}>
              <Badge variant={STATUS_VARIANT[r.status]} className="px-1.5 py-0">
                {REPORT_STATUS_LABELS[r.status]}
              </Badge>
              {r.status === 'returned' && r.review_comment && (
                <div className="max-w-40 whitespace-pre-line text-red-700" title={r.review_comment}>
                  {r.review_comment}
                </div>
              )}
            </td>
            <td className={cn(TD, 'whitespace-nowrap')}>{formatDateTimeJst(r.created_at)}</td>
            <td className={cn(TD, 'whitespace-nowrap text-right')}>{formatBytes(r.size_bytes)}</td>
            <td className={TD}>
              <ReportRowActions
                permissions={permissionsOf(r)}
                archived={r.storage_backend !== 'supabase'}
                busy={busyId === r.id}
                onAction={(action) => onAction(r, action)}
              />
            </td>
          </tr>
        ))}
        {reports.length === 0 && (
          <tr>
            <td colSpan={11} className="px-2 py-6 text-center text-gray-400">
              該当する報告書はありません
            </td>
          </tr>
        )}
      </tbody>
    </table>
  );
}
