import { useMemo, useState } from 'react';
import { Spinner } from '@/components/ui/Spinner';
import { useToast } from '@/components/ui/Toast';
import { useAuth } from '@/hooks/useAuth';
import { reviewEntry } from '@/lib/api/portal';
import type { PortalEntryRow, PortalInspectionRow } from '@/types/portal';
import { useRefetchOnVisible } from '@/features/approval/hooks/useRefetchOnVisible';
import { ReportUploadModal } from '@/features/inspection-documents/components/ReportUploadModal';
import { usePortalData } from '../hooks/usePortalData';
import { appliedEntry, canSubmit, type PortalRole } from '../lib/actions';
import { companyOptions, filterSchedule, INITIAL_FILTERS, matchInspection, type PortalFilters } from '../lib/filters';
import { buildSchedule, countSchedule, formatMonth, todayJst, unscheduledInspections, type ScheduleItem } from '../lib/schedule';
import { ApplyModal, type ApplyTarget } from './ApplyModal';
import { CountBadges } from './CountBadges';
import { PortalFilterBar } from './PortalFilterBar';
import { ScheduleTable } from './ScheduleTable';
import { SendBackDialog } from './SendBackDialog';
import { buildUnscheduledItems, UnscheduledTable } from './UnscheduledTable';

/** 一覧に出す先の月（仕様: 今月から12か月先まで。既定の絞り込みは3か月先まで） */
const MONTHS_AHEAD = 12;

interface ReportTarget {
  inspection: PortalInspectionRow;
  targetMonth: string | null;
  entryId: string | null;
  previous: ScheduleItem['report'];
}

interface SendBackTarget {
  entry: PortalEntryRow;
  subject: string;
}

function errorMessage(err: unknown): string {
  if (err && typeof err === 'object' && 'message' in err) return String((err as { message: unknown }).message ?? '');
  return '';
}

function subjectOf(inspection: PortalInspectionRow, month: string | null): string {
  const m = month ? `${formatMonth(month)}・` : '';
  return `${m}${inspection.property_name}（${inspection.property_code}）・${inspection.inspection_type_label ?? ''}`;
}

/**
 * 点検一覧（管理会社・保守会社・管理者）。範囲は DB が絞る（管理者は全社、保守会社は担当の点検、管理会社は自社物件）。
 * 管理会社はマスタ表を読めないので、ここでは portal_* の RPC と報告書の表だけを使う（申請のモーダルだけがマスタを読む）
 */
export function InspectionPortal() {
  const { addToast } = useToast();
  const { user, isAdmin, isManagement, vendorId } = useAuth();
  const role: PortalRole = useMemo(() => ({ isAdmin, isManagement }), [isAdmin, isManagement]);
  const data = usePortalData();
  const today = todayJst();

  const [filters, setFilters] = useState<PortalFilters>(INITIAL_FILTERS);
  const [applyTarget, setApplyTarget] = useState<ApplyTarget | null>(null);
  const [reportTarget, setReportTarget] = useState<ReportTarget | null>(null);
  const [sendBackTarget, setSendBackTarget] = useState<SendBackTarget | null>(null);
  const [busyEntryId, setBusyEntryId] = useState<string | null>(null);

  // モーダルを開いている間は読み直さない（操作中の行が入れ替わらないように）
  useRefetchOnVisible(data.refetch, !applyTarget && !reportTarget && !sendBackTarget && !data.loading);

  const schedule = useMemo(
    () => buildSchedule(data.inspections, data.entries, data.reports, { today, monthsAhead: MONTHS_AHEAD }),
    [data.inspections, data.entries, data.reports, today],
  );
  const counts = useMemo(() => countSchedule(schedule), [schedule]);
  const visible = useMemo(() => filterSchedule(schedule, filters, today), [schedule, filters, today]);
  const unscheduled = useMemo(
    () =>
      buildUnscheduledItems(
        unscheduledInspections(data.inspections).filter((i) => matchInspection(i, filters)),
        data.entries,
        data.reports,
      ),
    [data.inspections, data.entries, data.reports, filters],
  );

  const vendorOptions = useMemo(
    () => (isAdmin || isManagement ? companyOptions(data.inspections, (i) => ({ id: i.vendor_id, name: i.vendor_name })) : null),
    [data.inspections, isAdmin, isManagement],
  );
  const managementOptions = useMemo(
    () =>
      isAdmin
        ? companyOptions(data.inspections, (i) => ({ id: i.management_company_id, name: i.management_company_name }))
        : null,
    [data.inspections, isAdmin],
  );

  const approve = async (entry: PortalEntryRow) => {
    if (busyEntryId) return;
    setBusyEntryId(entry.id);
    try {
      await reviewEntry(entry.id, 'approve');
      addToast('承認しました', 'success');
      await data.refetch();
    } catch (err) {
      console.error('Approve failed:', err);
      addToast(`承認に失敗しました: ${errorMessage(err)}`, 'error');
    } finally {
      setBusyEntryId(null);
    }
  };

  const sendBack = async (reason: string) => {
    if (!sendBackTarget) return;
    const { entry } = sendBackTarget;
    setBusyEntryId(entry.id);
    try {
      await reviewEntry(entry.id, 'send_back', reason);
      addToast('差し戻しました', 'success');
      void data.refetch();
    } catch (err) {
      console.error('Send back failed:', err);
      addToast(`差戻しに失敗しました: ${errorMessage(err)}`, 'error');
      throw err;
    } finally {
      setBusyEntryId(null);
    }
  };

  const openReport = (item: ScheduleItem) =>
    setReportTarget({
      inspection: item.inspection,
      targetMonth: item.targetMonth,
      entryId: appliedEntry(item)?.id ?? null,
      // 提出中・受領済みの版があるときも置き換わる（DB が同じ点検・対象月の版を superseded にする）ので、前の版として見せる。
      // DB が置き換えるのは同じ保守会社の版だけ（台ごとに別の会社が居る点検）なので、他社の版は前の版にしない
      previous: item.report && (isAdmin || item.report.vendor_id === vendorId) ? item.report : null,
    });

  // 点検月の無い点検行: 申請・報告書は月をまたいでまとめてあるので、別の月の申請を紐付けない（entryId は付けない）。
  // 差戻しの再提出だけは元の報告書の月に揃える（実施日の月が変わっても同じ月の版として置き換わるように）
  const openUnscheduledReport = (item: ScheduleItem) => {
    const previous = item.report?.status === 'returned' ? item.report : null;
    setReportTarget({ inspection: item.inspection, targetMonth: previous?.target_month ?? null, entryId: null, previous });
  };

  if (!data.loaded && data.loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Spinner size="lg" />
      </div>
    );
  }
  if (!data.loaded && data.error) {
    return (
      <div className="py-12 text-center text-red-600">
        <p>点検一覧の読み込みに失敗しました</p>
        <p className="mt-1 text-sm">{data.error}</p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-baseline gap-2">
          <h1 className="text-base font-semibold text-gray-900">点検一覧</h1>
          {isAdmin && <span className="text-xs text-amber-700">全社モード（管理者）</span>}
          {data.loading && <Spinner size="sm" />}
        </div>
        <CountBadges counts={counts} active={filters.status} onSelect={(status) => setFilters({ ...filters, status, timing: status ? 'all' : INITIAL_FILTERS.timing })} />
      </div>
      <PortalFilterBar
        filters={filters}
        onChange={setFilters}
        vendorOptions={vendorOptions}
        managementOptions={managementOptions}
      />
      {data.loaded && data.error && (
        // 読み直しに失敗しても前の一覧は残す（古い状態であることだけ知らせる）
        <p className="text-xs text-red-600">最新の状態を読み込めませんでした（表示は前回の内容です）: {data.error}</p>
      )}
      <p className="text-xs text-gray-500">
        {visible.length}件／点検月を過ぎて承認待ち・承認済みの申請が無いものを「点検月超過」と表示します（日本時間の月末で判定）。
      </p>

      <ScheduleTable
        items={visible}
        role={role}
        busyEntryId={busyEntryId}
        onApply={(item, resubmit) => setApplyTarget({ inspection: item.inspection, targetMonth: item.targetMonth, resubmit })}
        onReport={openReport}
        onApprove={(_item, entry) => void approve(entry)}
        onSendBack={(item, entry) =>
          setSendBackTarget({ entry, subject: subjectOf(item.inspection, item.targetMonth) })
        }
      />

      <UnscheduledTable
        items={unscheduled}
        role={role}
        busyEntryId={busyEntryId}
        onApply={(item) => setApplyTarget({ inspection: item.inspection, targetMonth: null, resubmit: null })}
        onResubmit={(item, entry) => setApplyTarget({ inspection: item.inspection, targetMonth: null, resubmit: entry })}
        onReport={openUnscheduledReport}
        onApprove={(_item, entry) => void approve(entry)}
        onSendBack={(item, entry) => setSendBackTarget({ entry, subject: subjectOf(item.inspection, entry.target_month) })}
      />

      {canSubmit(role) && (
        <ApplyModal
          target={applyTarget}
          onClose={() => setApplyTarget(null)}
          onApplied={() => void data.refetch()}
          userId={user?.id ?? null}
          isAdmin={isAdmin}
          profileVendorId={vendorId ?? null}
        />
      )}
      {canSubmit(role) && (
        <ReportUploadModal
          open={!!reportTarget}
          onClose={() => setReportTarget(null)}
          inspection={reportTarget?.inspection ?? null}
          targetMonth={reportTarget?.targetMonth ?? null}
          entryId={reportTarget?.entryId ?? null}
          previous={reportTarget?.previous ?? null}
          onUploaded={() => {
            setReportTarget(null);
            void data.refetch();
          }}
        />
      )}
      <SendBackDialog
        open={!!sendBackTarget}
        subject={sendBackTarget?.subject ?? ''}
        onClose={() => setSendBackTarget(null)}
        onConfirm={sendBack}
      />
    </div>
  );
}
