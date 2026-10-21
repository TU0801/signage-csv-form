import { useMemo } from 'react';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import type { DbInspectionReport, PortalEntryRow, PortalInspectionRow } from '@/types/portal';
import { rowActions, type PortalRole } from '../lib/actions';
import { applicationState, formatMonth, monthOf, type ScheduleItem } from '../lib/schedule';
import { ReportCell } from './ScheduleTable';

/** 点検月の無い点検行の1行（予定の行と同じ操作を使えるよう ScheduleItem の形に寄せる） */
export interface UnscheduledItem extends ScheduleItem {
  /** 最新の申請の対象月（表示用） */
  latestMonth: string | null;
}

const LIVE = new Set(['submitted', 'accepted', 'returned']);

/**
 * 点検月が無いので月ごとの予定は作れない。点検行に紐付いた申請・報告書を月を問わずまとめ、
 * 最新の申請の状態を出す（承認・差戻しの対象も最新の申請）
 */
export function buildUnscheduledItems(
  inspections: PortalInspectionRow[],
  entries: PortalEntryRow[],
  reports: DbInspectionReport[],
): UnscheduledItem[] {
  return inspections.map((inspection) => {
    const mine = entries
      .filter((e) => e.property_inspection_id === inspection.inspection_id)
      .sort((a, b) => b.created_at.localeCompare(a.created_at));
    const report =
      reports
        .filter((r) => r.property_inspection_id === inspection.inspection_id && LIVE.has(r.status))
        .sort((a, b) => b.created_at.localeCompare(a.created_at))[0] ?? null;
    const latest = mine[0] ?? null;
    return {
      key: `${inspection.inspection_id}:unscheduled`,
      inspection,
      // 申請・報告書は月を選んで出す（null）。表示用には最新の申請の月
      targetMonth: '',
      latestMonth: latest?.target_month ?? (latest?.inspection_start ? monthOf(latest.inspection_start) : null),
      timing: 'upcoming',
      application: applicationState(mine),
      overdueUnapplied: false,
      entries: mine,
      report,
    };
  });
}

interface UnscheduledTableProps {
  items: UnscheduledItem[];
  role: PortalRole;
  busyEntryId: string | null;
  onApply: (item: UnscheduledItem) => void;
  onResubmit: (item: UnscheduledItem, entry: PortalEntryRow) => void;
  onReport: (item: UnscheduledItem) => void;
  onApprove: (item: UnscheduledItem, entry: PortalEntryRow) => void;
  onSendBack: (item: UnscheduledItem, entry: PortalEntryRow) => void;
}

const th = 'whitespace-nowrap px-2 py-1 text-left font-medium text-gray-600';
const td = 'px-2 py-1 align-top';

function LatestBadge({ item }: { item: UnscheduledItem }) {
  if (item.entries.length === 0) return <span className="text-gray-400">申請なし</span>;
  const month = item.latestMonth ? `${formatMonth(item.latestMonth)}分 ` : '';
  const badge =
    item.application === 'approved' ? (
      <Badge variant="success">承認済み</Badge>
    ) : item.application === 'applied' ? (
      <Badge variant="primary">申請済み（承認待ち）</Badge>
    ) : item.application === 'sent_back' ? (
      <Badge variant="warning">差戻し</Badge>
    ) : (
      <Badge>未申請</Badge>
    );
  return (
    <span className="inline-flex items-center gap-1">
      <span className="text-gray-500">{month}</span>
      {badge}
    </span>
  );
}

/** 点検月が未登録の点検。件数が多いので既定は閉じておく */
export function UnscheduledTable({
  items,
  role,
  busyEntryId,
  onApply,
  onResubmit,
  onReport,
  onApprove,
  onSendBack,
}: UnscheduledTableProps) {
  const rows = useMemo(
    () =>
      items.map((item) => {
        const a = rowActions(item, role);
        const resubmit = a.apply?.kind === 'resubmit' ? a.apply.entry : null;
        // 点検月が無いので、差戻し中でも別の月の申請は出せる（申請は常に出す）
        return { item, a, resubmit, canApply: a.report };
      }),
    [items, role],
  );
  if (items.length === 0) return null;
  return (
    <details className="rounded border border-gray-200 bg-white">
      <summary className="cursor-pointer select-none px-2 py-1.5 text-sm font-medium text-gray-800">
        点検月が未登録の点検（超過の判定ができません）
        <span className="ml-1 text-xs font-normal text-gray-500">{items.length}件</span>
      </summary>
      <p className="px-2 pb-1 text-xs text-gray-500">
        業務システムで点検月を登録すると上の表に出ます。申請・報告書は対象月を選んで出せます。
      </p>
      <div className="overflow-x-auto border-t border-gray-200">
        <table className="min-w-full text-xs">
          <thead className="bg-gray-50">
            <tr>
              <th className={th}>物件</th>
              <th className={th}>点検種別</th>
              <th className={th}>保守会社</th>
              {role.isAdmin && <th className={th}>管理会社</th>}
              <th className={th}>最新の申請</th>
              <th className={th}>報告書</th>
              <th className={th}>操作</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {rows.map(({ item, a, resubmit, canApply }) => {
              const { inspection } = item;
              const busy = !!busyEntryId && (a.approve?.id === busyEntryId || a.sendBack?.id === busyEntryId);
              return (
                <tr key={item.key} data-testid="unscheduled-row">
                  <td className={td}>
                    <div>{inspection.property_name}</div>
                    <div className="text-[11px] text-gray-500">{inspection.property_code}</div>
                  </td>
                  <td className={td}>{inspection.inspection_type_label ?? '－'}</td>
                  <td className={td}>{inspection.vendor_name ?? '－'}</td>
                  {role.isAdmin && <td className={td}>{inspection.management_company_name ?? '－'}</td>}
                  <td className={td}>
                    <LatestBadge item={item} />
                  </td>
                  <td className={td}>
                    <ReportCell report={item.report} />
                  </td>
                  <td className={`${td} whitespace-nowrap`}>
                    <div className="flex gap-1">
                      {resubmit && (
                        <Button size="sm" className="px-2 py-0.5 text-xs" onClick={() => onResubmit(item, resubmit)}>
                          修正して再申請
                        </Button>
                      )}
                      {canApply && (
                        <Button size="sm" className="px-2 py-0.5 text-xs" onClick={() => onApply(item)}>
                          申請
                        </Button>
                      )}
                      {a.report && (
                        <Button variant="secondary" size="sm" className="px-2 py-0.5 text-xs" onClick={() => onReport(item)}>
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
    </details>
  );
}
