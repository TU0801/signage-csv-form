import { useMemo, useState, type ReactNode } from 'react';
import { HeaderSlot } from '@/components/layout/HeaderSlot';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Spinner } from '@/components/ui/Spinner';
import { useAuth } from '@/hooks/useAuth';
import { cn, normalizeSearch } from '@/lib/utils';
import { useInspectionFormStore } from '@/stores/inspectionFormStore';
import { usePortalData } from '@/features/inspection-portal/hooks/usePortalData';
import { reportEntryId } from '@/features/inspection-portal/lib/actions';
import { addMonths, formatDate, formatMonth, monthOf, todayJst, typeFlagsMap, type ScheduleItem } from '@/features/inspection-portal/lib/schedule';
import { completionKeys, isRowCompleted } from '@/features/inspection-portal/lib/status';
import { buildNotifyOffIndex, buildUnitIndex } from '@/features/inspection-portal/lib/units';
import { buildReportCheckItems, REPORT_STATE_LABEL } from '@/features/inspection-portal/lib/reportCheck';
import { ReportUploadModal } from '@/features/inspection-documents/components/ReportUploadModal';
import { ManagementCompanyFilter } from '@/features/single-entry/components/ManagementCompanySelect';
import { useManagementCompanies } from '@/features/single-entry/hooks/useManagementCompanies';
import { MANAGEMENT_COMPANY_NONE } from '@/features/single-entry/lib/entryLogic';
import type { PortalInspectionRow } from '@/types/portal';

/** 対象月の選択肢の上限（今月から何か月さかのぼるか）。行のある最も古い月より前は出さない */
const MONTH_OPTIONS = 12;
const MONTH_SUFFIX = ['（今月）', '（前月）', '（前々月）'];

const REPORT_TONE: Record<keyof typeof REPORT_STATE_LABEL, string> = {
  submitted: 'bg-lime-200 text-lime-900',
  accepted: 'bg-green-600 text-white',
  returned: 'bg-amber-100 text-amber-800 ring-1 ring-amber-300',
};

const th = 'cell-head text-left font-medium text-gray-600 whitespace-nowrap';
const td = 'border-b border-gray-100 px-1.5 py-0.5 align-middle';
const control = 'h-7 rounded border border-gray-300 bg-white px-1.5 text-xs';

interface ReportTarget {
  inspection: PortalInspectionRow;
  targetMonth: string;
  entryId: string | null;
  previous: ScheduleItem['report'];
}

/** ISO の日時 → 日本時間の日付（2026/10/06） */
function jstDate(iso: string): string {
  return formatDate(todayJst(new Date(iso)));
}

/**
 * 報告書の確認（点検登録フォームの3つ目のタブ。修正依頼1027）。申請不要の点検（リモート点検・警備など）について、
 * 物件 × 点検種別 × 対象月の報告書が届いたか・未着かを一覧にし、その場で報告書UP できる。
 * 範囲は一括入力と同じ読み込み（usePortalData。管理者は全社、保守会社は担当の点検）
 */
export function ReportCheckPage({ modeSwitch }: { modeSwitch?: ReactNode } = {}) {
  const { isAdmin, vendorId: profileVendorId } = useAuth();
  const portal = usePortalData();
  const today = todayJst();
  const currentMonth = monthOf(today);

  const managementIndex = useManagementCompanies(true);
  const managementCompanyId = useInspectionFormStore((s) => s.managementCompanyId);
  const setManagementCompanyId = useInspectionFormStore((s) => s.setManagementCompanyId);

  const [month, setMonth] = useState(currentMonth);
  const [missingOnly, setMissingOnly] = useState(false);
  const [typeLabel, setTypeLabel] = useState('');
  const [search, setSearch] = useState('');
  const [reportTarget, setReportTarget] = useState<ReportTarget | null>(null);

  const flags = useMemo(() => typeFlagsMap(portal.typeFlags), [portal.typeFlags]);
  const unitIndex = useMemo(() => buildUnitIndex(portal.units), [portal.units]);
  const notify = useMemo(() => buildNotifyOffIndex(portal.notifyOff), [portal.notifyOff]);
  const completed = useMemo(() => completionKeys(portal.completions), [portal.completions]);

  const items = useMemo(
    () =>
      buildReportCheckItems(portal.inspections, portal.entries, portal.reports, {
        today,
        flags,
        unitIndex,
        unitVendorId: isAdmin ? null : (profileVendorId ?? null),
        notify,
      }),
    [portal.inspections, portal.entries, portal.reports, today, flags, unitIndex, isAdmin, profileVendorId, notify],
  );

  // 行は点検の登録月（schedule_from）から出るので、それより前の月を選べると「0件中 0件」と出て未着が無いように見える。
  // 選べるのは行のある最も古い月から今月まで（行が無ければ今月だけ）
  const monthOptions = useMemo(() => {
    const oldest = items.reduce((min, i) => (i.targetMonth < min ? i.targetMonth : min), currentMonth);
    const options: { value: string; label: string }[] = [];
    for (let i = 0; i < MONTH_OPTIONS; i++) {
      const m = addMonths(currentMonth, -i);
      if (m < oldest) break;
      options.push({ value: m, label: `${formatMonth(m)}${MONTH_SUFFIX[i] ?? ''}` });
    }
    return options;
  }, [items, currentMonth]);
  const typeOptions = useMemo(
    () => [...new Set(items.map((i) => i.inspection.inspection_type_label ?? ''))].filter(Boolean).sort(),
    [items],
  );

  // 未着だけ以外の条件（件数はこの範囲で数える）
  const inScope = useMemo(() => {
    const q = normalizeSearch(search);
    const want = managementCompanyId === MANAGEMENT_COMPANY_NONE ? null : managementCompanyId;
    return items.filter(
      (i) =>
        i.targetMonth === month &&
        (!typeLabel || (i.inspection.inspection_type_label ?? '') === typeLabel) &&
        (!managementCompanyId || !managementIndex || i.inspection.management_company_id === want) &&
        (!q || normalizeSearch(`${i.inspection.property_code} ${i.inspection.property_name}`).includes(q)),
    );
  }, [items, month, typeLabel, managementCompanyId, managementIndex, search]);
  const received = inScope.filter((i) => i.report).length;
  const shown = missingOnly ? inScope.filter((i) => !i.report) : inScope;

  const openReport = (item: ScheduleItem) =>
    setReportTarget({
      inspection: item.inspection,
      targetMonth: item.targetMonth,
      entryId: reportEntryId(item),
      // DB が置き換えるのは同じ保守会社の版だけなので、他社の版は前の版にしない（一括入力と同じ）
      previous: item.report && (isAdmin || item.report.vendor_id === profileVendorId) ? item.report : null,
    });

  return (
    <div className="flex flex-col gap-2 tall:h-[calc(100dvh-var(--header-h)-1.5rem)]">
      <h1 className="sr-only">点検登録フォーム（報告書の確認）</h1>
      {managementIndex && (
        <HeaderSlot>
          <ManagementCompanyFilter
            companies={managementIndex.companies}
            value={managementCompanyId}
            onChange={setManagementCompanyId}
          />
        </HeaderSlot>
      )}
      <Card className="flex flex-col overflow-hidden tall:min-h-0 tall:flex-1">
        <div className="flex flex-wrap items-center gap-1.5 border-b border-gray-200 px-2 py-1.5">
          {modeSwitch}
          <select aria-label="対象月" value={month} onChange={(e) => setMonth(e.target.value)} className={control}>
            {monthOptions.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
          <select aria-label="点検種別" value={typeLabel} onChange={(e) => setTypeLabel(e.target.value)} className={control}>
            <option value="">点検種別: すべて</option>
            {typeOptions.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
          <label className={cn(control, 'inline-flex items-center gap-1 whitespace-nowrap text-gray-700')}>
            <input
              type="checkbox"
              checked={missingOnly}
              onChange={(e) => setMissingOnly(e.target.checked)}
              className="h-3.5 w-3.5 rounded border-gray-300"
            />
            未着だけ
          </label>
          <input
            type="search"
            aria-label="物件名・コードで検索"
            placeholder="物件名・コード"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className={cn(control, 'w-36')}
          />
          <span className="ml-1 whitespace-nowrap text-xs text-gray-700" data-testid="report-summary">
            {portal.error ? (
              '件数: —'
            ) : (
              <>
                {inScope.length}件中 <b className="text-green-700">{received}件</b> 届いた（未着{' '}
                <b className={inScope.length - received > 0 ? 'text-red-700' : ''}>{inScope.length - received}件</b>）
              </>
            )}
          </span>
          {portal.loading && <Spinner size="sm" />}
        </div>
        <p className="border-b border-gray-200 px-2 py-0.5 text-[11px] text-gray-500">
          申請不要の点検（点検種別が報告書のみ・点検日連絡が OFF。リモート点検など）の報告書が、対象月に届いたかを出します。
          台ごとの点検は報告書が点検ごと（No1）なので1行です。点検の登録月より前の月は出ません。点検月の無い点検は報告書が届いた月だけ出ます（未着になりません）。
        </p>
        {portal.error && (
          <div className="flex items-center gap-2 border-b border-gray-200 px-3 py-1 text-xs text-red-600">
            <span>点検の予定を読み込めませんでした（{portal.error}）</span>
            <Button variant="secondary" size="sm" className="px-2 py-0.5 text-xs" onClick={() => void portal.refetch()}>
              再読み込み
            </Button>
          </div>
        )}
        <div className="min-h-[12rem] overflow-auto tall:min-h-0 tall:flex-1">
          <table className="w-full border-collapse text-xs">
            <thead className="sticky top-0 z-10 bg-gray-50">
              <tr className="border-b">
                <th className={cn(th, 'w-[5.5rem]')}>物件コード</th>
                <th className={th}>物件</th>
                <th className={th}>点検種別</th>
                {isAdmin && <th className={th}>保守会社</th>}
                <th className={cn(th, 'w-[6rem]')}>対象月</th>
                <th className={th}>報告書</th>
                <th className={cn(th, 'w-[6rem]')}>報告書UP</th>
              </tr>
            </thead>
            <tbody>
              {shown.map((item) => {
                const r = item.report;
                const state = r && r.status in REPORT_STATE_LABEL ? (r.status as keyof typeof REPORT_STATE_LABEL) : null;
                return (
                  <tr key={item.key} className={cn('hover:bg-gray-50', !r && 'bg-red-50/40')} data-report={r ? 'received' : 'missing'}>
                    <td className={cn(td, 'whitespace-nowrap tabular-nums text-gray-500')}>{item.inspection.property_code}</td>
                    <td className={cn(td, 'text-gray-900')}>{item.inspection.property_name}</td>
                    <td className={td}>{item.inspection.inspection_type_label ?? ''}</td>
                    {isAdmin && <td className={cn(td, 'text-gray-600')}>{item.inspection.vendor_name ?? ''}</td>}
                    <td className={cn(td, 'whitespace-nowrap tabular-nums')}>{formatMonth(item.targetMonth)}</td>
                    <td className={cn(td, 'whitespace-nowrap')}>
                      {r ? (
                        <span className="inline-flex items-center gap-1.5">
                          {state && (
                            <span className={cn('rounded px-1.5 py-px text-[11px] font-medium', REPORT_TONE[state])}>
                              {REPORT_STATE_LABEL[state]}
                            </span>
                          )}
                          <span className="tabular-nums text-gray-700">実施 {formatDate(r.performed_on)}</span>
                          <span className="tabular-nums text-gray-500">登録 {jstDate(r.created_at)}</span>
                          {r.status === 'returned' && r.review_comment && (
                            <span className="max-w-[16rem] truncate text-[11px] text-amber-800" title={r.review_comment}>
                              理由: {r.review_comment}
                            </span>
                          )}
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1.5">
                          <span className="rounded bg-red-100 px-1.5 py-px text-[11px] font-medium text-red-800 ring-1 ring-red-300">
                            未着
                          </span>
                          {item.unitRows.some((u) => isRowCompleted(u, completed)) && <span className="text-[11px] text-gray-500">完了連絡あり</span>}
                        </span>
                      )}
                    </td>
                    <td className={td}>
                      <button
                        type="button"
                        className="h-6 whitespace-nowrap rounded border border-gray-300 bg-white px-1.5 text-[11px] leading-none text-gray-700 hover:bg-gray-100"
                        onClick={() => openReport(item)}
                        title="この点検・対象月の報告書（PDF）を登録する"
                      >
                        {r?.status === 'returned' ? '報告書を再提出' : '報告書UP'}
                      </button>
                    </td>
                  </tr>
                );
              })}
              {shown.length === 0 && (
                <tr>
                  <td colSpan={isAdmin ? 7 : 6} className="px-3 py-6 text-center text-xs text-gray-500">
                    {portal.error ? '読み込めませんでした' : portal.loaded ? '該当する点検はありません' : '読み込み中…'}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>
      <ReportUploadModal
        open={!!reportTarget}
        onClose={() => setReportTarget(null)}
        inspection={reportTarget?.inspection ?? null}
        targetMonth={reportTarget?.targetMonth ?? null}
        entryId={reportTarget?.entryId ?? null}
        previous={reportTarget?.previous ?? null}
        onUploaded={() => {
          setReportTarget(null);
          void portal.refetch();
        }}
      />
    </div>
  );
}
