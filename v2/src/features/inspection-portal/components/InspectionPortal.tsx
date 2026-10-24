import { useCallback, useMemo, useState } from 'react';
import { Button } from '@/components/ui/Button';
import { Spinner } from '@/components/ui/Spinner';
import { useToast } from '@/components/ui/Toast';
import { useAuth } from '@/hooks/useAuth';
import { entryErrorReason } from '@/lib/api/admin-entries';
import { reviewEntry } from '@/lib/api/portal';
import type { PortalEntryRow, PortalInspectionRow } from '@/types/portal';
import { useRefetchOnVisible } from '@/features/approval/hooks/useRefetchOnVisible';
import { ReportUploadModal } from '@/features/inspection-documents/components/ReportUploadModal';
import { usePortalData } from '../hooks/usePortalData';
import { appliedEntry, canSubmit, type PortalRole } from '../lib/actions';
import { filterSchedule, filterUnscheduled, INITIAL_FILTERS, type PortalFilters } from '../lib/filters';
import { buildSchedule, formatMonth, todayJst, unscheduledInspections, type ScheduleItem } from '../lib/schedule';
import { completionKeys, countStatuses, itemStatus } from '../lib/status';
import { ApplyModal, type ApplyTarget } from './ApplyModal';
import { CountBadges } from './CountBadges';
import { EntryDetailModal, type EntryDetailTarget } from './EntryDetailModal';
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
  const [detailTarget, setDetailTarget] = useState<EntryDetailTarget | null>(null);
  const [busyEntryId, setBusyEntryId] = useState<string | null>(null);

  // モーダルを開いている間は読み直さない（操作中の行が入れ替わらないように）
  useRefetchOnVisible(
    data.refetch,
    !applyTarget && !reportTarget && !sendBackTarget && !detailTarget && !data.loading,
  );

  const schedule = useMemo(
    () => buildSchedule(data.inspections, data.entries, data.reports, { today, monthsAhead: MONTHS_AHEAD }),
    [data.inspections, data.entries, data.reports, today],
  );
  // 点検月の無い点検（本番の大半）も件数バッジと申請状況の絞り込みに含める
  const unscheduledAll = useMemo(
    () => buildUnscheduledItems(unscheduledInspections(data.inspections), data.entries, data.reports),
    [data.inspections, data.entries, data.reports],
  );
  // ステータス（修正依頼1024 B14）。完了連絡を含めて決める
  const completed = useMemo(() => completionKeys(data.completions), [data.completions]);
  const statusOf = useCallback((item: ScheduleItem) => itemStatus(item, completed, today), [completed, today]);
  const counts = useMemo(
    () => countStatuses([...schedule, ...unscheduledAll].map(statusOf)),
    [schedule, unscheduledAll, statusOf],
  );
  const visible = useMemo(() => filterSchedule(schedule, filters, today, statusOf), [schedule, filters, today, statusOf]);
  const unscheduled = useMemo(() => filterUnscheduled(unscheduledAll, filters, statusOf), [unscheduledAll, filters, statusOf]);

  // 管理会社の絞り込みは点検登録フォームのヘッダーへ移した（修正依頼1024 B19）。この一覧は管理会社のアカウントが見る

  const approve = async (entry: PortalEntryRow) => {
    if (busyEntryId) return;
    setBusyEntryId(entry.id);
    try {
      await reviewEntry(entry.id, 'approve');
      addToast('承認しました', 'success');
      setDetailTarget(null);
      await data.refetch();
    } catch (err) {
      console.error('Approve failed:', err);
      addToast(`承認に失敗しました: ${entryErrorReason(err)}`, 'error');
      throw err;
    } finally {
      setBusyEntryId(null);
    }
  };

  const openDetail = (item: ScheduleItem, entry: PortalEntryRow, month: string | null) =>
    setDetailTarget({ entry, subject: subjectOf(item.inspection, month), history: item.entries });

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
      addToast(`差戻しに失敗しました: ${entryErrorReason(err)}`, 'error');
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
      <div className="space-y-2 py-12 text-center">
        <p className="text-sm text-red-600">点検一覧を読み込めませんでした（{data.error}）</p>
        <Button variant="secondary" size="sm" onClick={() => void data.refetch()} disabled={data.loading}>
          再読み込み
        </Button>
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
      />
      {data.loaded && data.error && (
        // 読み直しに失敗しても前の一覧は残す（古い状態であることだけ知らせ、読み直せるようにする）
        <div className="flex items-center gap-2 text-xs text-red-600">
          <span>最新の状態を読み込めませんでした（表示は前回の内容です）: {data.error}</span>
          <Button variant="secondary" size="sm" className="px-2 py-0.5 text-xs" onClick={() => void data.refetch()} disabled={data.loading}>
            再読み込み
          </Button>
        </div>
      )}
      <div className="flex flex-wrap items-baseline gap-x-3 text-xs">
        <span className="font-medium tabular-nums text-gray-800" data-testid="schedule-count">
          {visible.length}件
        </span>
        <span className="text-gray-500">
          点検月を過ぎて承認待ち・承認済みの申請が無いものを「点検月超過」、承認済みで点検日を過ぎて報告書が無いものを「報告書未提出」と表示します（日本時間で判定）。
        </span>
      </div>

      <ScheduleTable
        items={visible}
        role={role}
        statusOf={statusOf}
        busyEntryId={busyEntryId}
        onApply={(item, resubmit) => setApplyTarget({ inspection: item.inspection, targetMonth: item.targetMonth, resubmit })}
        onReport={openReport}
        onReview={(item, entry) => openDetail(item, entry, item.targetMonth)}
      />

      <UnscheduledTable
        items={unscheduled}
        role={role}
        statusOf={statusOf}
        busyEntryId={busyEntryId}
        onApply={(item) => setApplyTarget({ inspection: item.inspection, targetMonth: null, resubmit: null })}
        onResubmit={(item, entry) => setApplyTarget({ inspection: item.inspection, targetMonth: null, resubmit: entry })}
        onReport={openUnscheduledReport}
        onReview={(item, entry) => openDetail(item, entry, entry.target_month)}
        forceOpen={filters.status !== '' && unscheduled.length > 0}
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
      <EntryDetailModal
        target={detailTarget}
        busy={!!busyEntryId}
        onClose={() => setDetailTarget(null)}
        onApprove={approve}
        onSendBack={(entry) => {
          // 理由を聞くダイアログへ引き継ぐ（内容のモーダルは閉じる）
          const subject = detailTarget?.subject ?? '';
          setDetailTarget(null);
          setSendBackTarget({ entry, subject });
        }}
      />
      <SendBackDialog
        open={!!sendBackTarget}
        subject={sendBackTarget?.subject ?? ''}
        onClose={() => setSendBackTarget(null)}
        onConfirm={sendBack}
      />
    </div>
  );
}
