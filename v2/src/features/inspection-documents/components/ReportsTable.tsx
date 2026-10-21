import { useEffect, useRef } from 'react';
import type { DbInspectionReport } from '@/types/portal';
import { Badge } from '@/components/ui/Badge';
import { cn } from '@/lib/utils';
import {
  REPORT_STATUS,
  formatBytes,
  formatDateTimeJst,
  type ReportPermissions,
} from '../lib/documents';
import { ReportRowActions, type ReportAction } from './ReportRowActions';

interface ReportsTableProps {
  reports: DbInspectionReport[];
  selected: Set<string>;
  onToggle: (id: string) => void;
  onToggleAll: (checked: boolean) => void;
  permissionsOf: (report: DbInspectionReport) => ReportPermissions;
  /** 点検一覧のリンクで指された行（強調して見える位置へ送る） */
  highlightId?: string | null;
  busyId: string | null;
  onAction: (report: DbInspectionReport, action: ReportAction) => void;
}

const TH = 'whitespace-nowrap px-1.5 py-1 text-left font-medium text-gray-600';
const TD = 'px-1.5 py-0.5 align-top';
// 会社名・建物名は1行で切り、全文は title で見せる（td には max-width が効かないので内側のブロックで切る）
const NAME = 'max-w-32 truncate 2xl:max-w-48';

export function ReportsTable({
  reports,
  selected,
  onToggle,
  onToggleAll,
  permissionsOf,
  highlightId = null,
  busyId,
  onAction,
}: ReportsTableProps) {
  const allChecked = reports.length > 0 && reports.every((r) => selected.has(r.id));
  const highlightRef = useRef<HTMLTableRowElement>(null);
  useEffect(() => {
    highlightRef.current?.scrollIntoView?.({ block: 'center' });
  }, [highlightId]);
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
          {/* 1366 幅で操作の列まで横スクロール無しに収まるよう、サイズは広い画面だけに出す（CSV には残る） */}
          <th className={cn(TH, 'hidden text-right 2xl:table-cell')}>サイズ</th>
          <th className={TH}>操作</th>
        </tr>
      </thead>
      <tbody>
        {reports.map((r) => (
          <tr
            key={r.id}
            ref={r.id === highlightId ? highlightRef : undefined}
            aria-current={r.id === highlightId ? 'true' : undefined}
            className={cn(
              'border-b border-gray-100',
              r.id === highlightId ? 'bg-amber-50 outline outline-1 -outline-offset-1 outline-amber-300' : 'hover:bg-gray-50',
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
            {/* ファイル名は全文を見せたいので折り返すが、ほかの列に押されて細くならないよう最小幅を取る */}
            <td className={cn(TD, 'min-w-48 break-all 2xl:min-w-56')}>
              {r.file_name}
              {r.note && <div className="text-gray-500">メモ: {r.note}</div>}
            </td>
            <td className={TD}>
              <div className={NAME} title={r.property_name}>
                {r.property_name}
              </div>
            </td>
            <td className={TD}>
              <div className={NAME} title={r.inspection_type_label}>
                {r.inspection_type_label}
              </div>
              {r.property_inspection_id === null && (
                <div
                  className="whitespace-nowrap text-gray-500"
                  title="業務システムで点検の行が削除されました。報告書は残っていますが、出し直す点検を選べないため再提出はできません"
                >
                  点検行が削除済み
                </div>
              )}
            </td>
            <td className={cn(TD, 'whitespace-nowrap')}>{r.performed_on}</td>
            <td className={cn(TD, 'whitespace-nowrap')}>{r.target_month?.slice(0, 7) ?? ''}</td>
            <td className={TD}>
              <div className={NAME} title={r.vendor_name ?? undefined}>
                {r.vendor_name ?? ''}
              </div>
            </td>
            <td className={TD}>
              <Badge variant={REPORT_STATUS[r.status].variant} className="whitespace-nowrap px-1.5 py-0">
                {REPORT_STATUS[r.status].label}
              </Badge>
              {r.status === 'returned' && r.review_comment && (
                <div className="max-w-28 truncate text-red-700" title={r.review_comment}>
                  {r.review_comment}
                </div>
              )}
            </td>
            <td className={cn(TD, 'whitespace-nowrap')}>{formatDateTimeJst(r.created_at)}</td>
            <td className={cn(TD, 'hidden whitespace-nowrap text-right 2xl:table-cell')}>{formatBytes(r.size_bytes)}</td>
            <td className={cn(TD, 'whitespace-nowrap')}>
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
