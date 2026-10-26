import { Link } from 'react-router-dom';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { cn } from '@/lib/utils';
import type { DbInspectionReport, PortalEntryRow } from '@/types/portal';
import { appliedEntry, rowActions, type PortalRole } from '../lib/actions';
import type { StatusOf } from '../lib/filters';
import { focusEntry, formatDate, formatMonth, type ScheduleItem } from '../lib/schedule';
import { StatusBadge } from './StatusBadge';

/** 行の操作（ページが申請・報告書・承認・差戻しのモーダルを開く） */
export interface ScheduleRowHandlers {
  onApply: (item: ScheduleItem, resubmit: PortalEntryRow | null) => void;
  onReport: (item: ScheduleItem) => void;
  /** 申請の内容を開く（承認・差戻しはそこから。中身を見ずに承認させない） */
  onReview: (item: ScheduleItem, entry: PortalEntryRow) => void;
}

interface ScheduleTableProps extends ScheduleRowHandlers {
  items: ScheduleItem[];
  role: PortalRole;
  /** 行のステータス（完了連絡を含めて決める） */
  statusOf: StatusOf;
  /** 承認・差戻しを送っている申請（二度押しを止める） */
  busyEntryId: string | null;
}

function inspectionDates(entry: PortalEntryRow | null): string {
  if (!entry?.inspection_start) return '';
  const end =
    entry.inspection_end && entry.inspection_end !== entry.inspection_start ? `〜${formatDate(entry.inspection_end)}` : '';
  return `${formatDate(entry.inspection_start)}${end}`;
}

const REPORT_LABEL: Record<string, { label: string; variant: 'primary' | 'success' | 'warning' }> = {
  submitted: { label: '確認待ち', variant: 'primary' },
  accepted: { label: '受領済み', variant: 'success' },
  returned: { label: '差戻し', variant: 'warning' },
};

/**
 * 報告書の状態。押すとその報告書に絞った点検報告書の画面を開く（受領・差戻し・プレビューはそちらで行う。
 * 管理会社は点検一覧から報告書を扱う手段がほかに無い）
 */
export function ReportCell({ report }: { report: DbInspectionReport | null }) {
  if (!report) return <span className="text-gray-400">－</span>;
  const r = REPORT_LABEL[report.status];
  return (
    <Link
      to={`/portal/documents?report=${encodeURIComponent(report.id)}`}
      className="inline-flex items-center gap-1 whitespace-nowrap hover:underline"
      title={report.review_comment ? `差戻しの理由: ${report.review_comment}` : '点検報告書の画面で開く'}
    >
      {r && <Badge variant={r.variant}>{r.label}</Badge>}
      <span className="tabular-nums text-blue-700">{formatDate(report.performed_on)}実施</span>
    </Link>
  );
}

const small = 'px-2 py-0.5 text-xs';

/**
 * 承認・差戻しのボタン（予定の表と点検月の無い点検の表で共通）。承認待ちは内容を開いてから承認・差戻しする。
 * 承認済みの差戻しは承認の取り消しなので、塗りの赤ではなく控えめな見た目にして名前で意味を示す（これも内容を開いてから）
 */
export function ReviewButtons({
  approve,
  sendBack,
  busy,
  onReview,
}: {
  approve: PortalEntryRow | null;
  sendBack: PortalEntryRow | null;
  busy: boolean;
  onReview: (entry: PortalEntryRow) => void;
}) {
  if (approve) {
    return (
      <Button variant="success" size="sm" className={small} disabled={busy} onClick={() => onReview(approve)}>
        内容を確認して承認
      </Button>
    );
  }
  if (sendBack?.status === 'ready') {
    return (
      <Button
        variant="ghost"
        size="sm"
        className={cn(small, 'border border-gray-300 text-gray-700')}
        disabled={busy}
        onClick={() => onReview(sendBack)}
      >
        承認を取り消して差戻し
      </Button>
    );
  }
  return null;
}

const th = 'whitespace-nowrap px-2 py-1 text-left font-medium text-gray-600';
const td = 'px-2 py-1 align-top';

/** 点検の予定（点検行 × 対象月）の表。行高を詰め、操作は右端にまとめる */
/**
 * 列の出し分け（修正依頼1024 B19）。保守会社列: 管理会社・管理者に出す（保守会社のアカウントには出さない）。
 * 管理会社列: 保守会社・管理者に出す（管理会社のアカウントには出さない）
 */
export function portalColumns(role: PortalRole): { showVendor: boolean; showManagement: boolean } {
  return { showVendor: role.isAdmin || role.isManagement, showManagement: role.isAdmin || !role.isManagement };
}

export function ScheduleTable({
  items,
  role,
  statusOf,
  busyEntryId,
  onApply,
  onReport,
  onReview,
}: ScheduleTableProps) {
  const { showVendor, showManagement } = portalColumns(role);
  if (items.length === 0) {
    return <p className="px-2 py-4 text-center text-sm text-gray-500">条件に合う点検はありません</p>;
  }
  return (
    <div className="overflow-x-auto rounded border border-gray-200 bg-white">
      <table className="min-w-full text-xs">
        <thead className="bg-gray-50">
          <tr>
            <th className={th}>対象月</th>
            <th className={th}>物件</th>
            <th className={th}>点検種別</th>
            {showVendor && <th className={th}>保守会社</th>}
            {showManagement && <th className={th}>管理会社</th>}
            <th className={th}>ステータス</th>
            <th className={th}>点検日</th>
            <th className={th}>報告書</th>
            <th className={th}>操作</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {items.map((item) => {
            const a = rowActions(item, role);
            const { inspection } = item;
            const sentBackEntry = item.application === 'sent_back' ? focusEntry(item.entries) : null;
            const busy = !!busyEntryId && (a.approve?.id === busyEntryId || a.sendBack?.id === busyEntryId);
            return (
              <tr key={item.key} className={cn(item.overdueUnapplied && 'bg-red-50/60')} data-testid="schedule-row">
                <td className={cn(td, 'whitespace-nowrap tabular-nums')}>{formatMonth(item.targetMonth)}</td>
                <td className={td}>
                  <div>{inspection.property_name}</div>
                  {/* 台ごとの行の No（設備会社固有の No。修正依頼1026 I7） */}
                  {item.unitCode && (
                    <div className="text-[11px] font-semibold text-red-700" data-testid="unit-code">
                      {item.unitCode}
                    </div>
                  )}
                  <div className="text-[11px] text-gray-500">{inspection.property_code}</div>
                </td>
                <td className={td}>{inspection.inspection_type_label ?? '－'}</td>
                {showVendor && <td className={td}>{inspection.vendor_name ?? '－'}</td>}
                {showManagement && <td className={td}>{inspection.management_company_name ?? '－'}</td>}
                <td className={td}>
                  <StatusBadge status={statusOf(item)} />
                  {sentBackEntry?.review_comment && (
                    <div className="mt-0.5 max-w-[16rem] whitespace-pre-line text-[11px] text-amber-800">
                      理由: {sentBackEntry.review_comment}
                    </div>
                  )}
                </td>
                <td className={cn(td, 'whitespace-nowrap tabular-nums')}>{inspectionDates(appliedEntry(item))}</td>
                <td className={td}>
                  <ReportCell report={item.report} />
                </td>
                <td className={cn(td, 'whitespace-nowrap')}>
                  <div className="flex gap-1">
                    {a.apply && (
                      <Button
                        size="sm"
                        className={small}
                        onClick={() => onApply(item, a.apply?.kind === 'resubmit' ? a.apply.entry : null)}
                      >
                        {a.apply.kind === 'resubmit' ? '修正して再申請' : '申請'}
                      </Button>
                    )}
                    {/* 報告書は点検行 × 対象月の単位なので、報告書UP は1台目の行だけ（修正依頼1026 I7） */}
                    {a.report && !item.secondary && (
                      <Button
                        variant="secondary"
                        size="sm"
                        className={small}
                        onClick={() => onReport(item)}
                      >
                        {item.report?.status === 'returned' ? '報告書を再提出' : '報告書UP'}
                      </Button>
                    )}
                    <ReviewButtons
                      approve={a.approve}
                      sendBack={a.sendBack}
                      busy={busy}
                      onReview={(entry) => onReview(item, entry)}
                    />
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
