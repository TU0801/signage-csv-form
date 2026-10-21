import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { cn } from '@/lib/utils';
import type { DbInspectionReport, PortalEntryRow } from '@/types/portal';
import { appliedEntry, rowActions, type PortalRole } from '../lib/actions';
import { formatMonth, type ScheduleItem } from '../lib/schedule';

/** 行の操作（ページが申請・報告書・承認・差戻しのモーダルを開く） */
export interface ScheduleRowHandlers {
  onApply: (item: ScheduleItem, resubmit: PortalEntryRow | null) => void;
  onReport: (item: ScheduleItem) => void;
  onApprove: (item: ScheduleItem, entry: PortalEntryRow) => void;
  onSendBack: (item: ScheduleItem, entry: PortalEntryRow) => void;
}

interface ScheduleTableProps extends ScheduleRowHandlers {
  items: ScheduleItem[];
  role: PortalRole;
  /** 承認・差戻しを送っている申請（二度押しを止める） */
  busyEntryId: string | null;
}

/** 2026-11-05 → 11/5 */
function md(date: string | null): string {
  if (!date) return '';
  return `${Number(date.slice(5, 7))}/${Number(date.slice(8, 10))}`;
}

function inspectionDates(entry: PortalEntryRow | null): string {
  if (!entry?.inspection_start) return '';
  const end = entry.inspection_end && entry.inspection_end !== entry.inspection_start ? `〜${md(entry.inspection_end)}` : '';
  return `${md(entry.inspection_start)}${end}`;
}

const REPORT_LABEL: Record<string, { label: string; variant: 'primary' | 'success' | 'warning' }> = {
  submitted: { label: '確認待ち', variant: 'primary' },
  accepted: { label: '受領済み', variant: 'success' },
  returned: { label: '差戻し', variant: 'warning' },
};

export function ApplicationBadge({ item }: { item: Pick<ScheduleItem, 'application' | 'overdueUnapplied'> }) {
  if (item.overdueUnapplied) {
    // 差戻しのまま月を過ぎたものも超過（承認待ち・承認済みの申請が無い）
    return (
      <Badge variant="danger">{item.application === 'sent_back' ? '点検月超過（差戻し）' : '点検月超過'}</Badge>
    );
  }
  switch (item.application) {
    case 'approved':
      return <Badge variant="success">承認済み</Badge>;
    case 'applied':
      return <Badge variant="primary">申請済み（承認待ち）</Badge>;
    case 'sent_back':
      return <Badge variant="warning">差戻し</Badge>;
    default:
      return <Badge>未申請</Badge>;
  }
}

export function ReportCell({ report }: { report: DbInspectionReport | null }) {
  if (!report) return <span className="text-gray-400">－</span>;
  const r = REPORT_LABEL[report.status];
  return (
    <span className="inline-flex items-center gap-1" title={report.review_comment ?? undefined}>
      {r && <Badge variant={r.variant}>{r.label}</Badge>}
      <span className="tabular-nums text-gray-600">{md(report.performed_on)}実施</span>
    </span>
  );
}

const th = 'whitespace-nowrap px-2 py-1 text-left font-medium text-gray-600';
const td = 'px-2 py-1 align-top';

/** 点検の予定（点検行 × 対象月）の表。行高を詰め、操作は右端にまとめる */
export function ScheduleTable({
  items,
  role,
  busyEntryId,
  onApply,
  onReport,
  onApprove,
  onSendBack,
}: ScheduleTableProps) {
  const showManagement = role.isAdmin;
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
            <th className={th}>保守会社</th>
            {showManagement && <th className={th}>管理会社</th>}
            <th className={th}>申請状況</th>
            <th className={th}>点検日</th>
            <th className={th}>報告書</th>
            <th className={th}>操作</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {items.map((item) => {
            const a = rowActions(item, role);
            const { inspection } = item;
            const sentBackEntry = item.application === 'sent_back' ? item.entries.find((e) => e.review_comment) : null;
            const busy = !!busyEntryId && (a.approve?.id === busyEntryId || a.sendBack?.id === busyEntryId);
            return (
              <tr key={item.key} className={cn(item.overdueUnapplied && 'bg-red-50/60')} data-testid="schedule-row">
                <td className={cn(td, 'whitespace-nowrap tabular-nums')}>{formatMonth(item.targetMonth)}</td>
                <td className={td}>
                  <div>{inspection.property_name}</div>
                  <div className="text-[11px] text-gray-500">{inspection.property_code}</div>
                </td>
                <td className={td}>{inspection.inspection_type_label ?? '－'}</td>
                <td className={td}>{inspection.vendor_name ?? '－'}</td>
                {showManagement && <td className={td}>{inspection.management_company_name ?? '－'}</td>}
                <td className={td}>
                  <ApplicationBadge item={item} />
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
                        className="px-2 py-0.5 text-xs"
                        onClick={() => onApply(item, a.apply?.kind === 'resubmit' ? a.apply.entry : null)}
                      >
                        {a.apply.kind === 'resubmit' ? '修正して再申請' : '申請'}
                      </Button>
                    )}
                    {a.report && (
                      <Button
                        variant="secondary"
                        size="sm"
                        className="px-2 py-0.5 text-xs"
                        onClick={() => onReport(item)}
                      >
                        {item.report?.status === 'returned' ? '報告書を再提出' : '報告書'}
                      </Button>
                    )}
                    {a.approve && (
                      <Button
                        variant="success"
                        size="sm"
                        className="px-2 py-0.5 text-xs"
                        disabled={busy}
                        onClick={() => onApprove(item, a.approve!)}
                      >
                        承認
                      </Button>
                    )}
                    {a.sendBack && (
                      <Button
                        variant="danger"
                        size="sm"
                        className="px-2 py-0.5 text-xs"
                        disabled={busy}
                        onClick={() => onSendBack(item, a.sendBack!)}
                      >
                        差戻し
                      </Button>
                    )}
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
