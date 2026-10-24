import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { HeaderSlot } from '@/components/layout/HeaderSlot';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Spinner } from '@/components/ui/Spinner';
import { useToast } from '@/components/ui/Toast';
import { useAuth } from '@/hooks/useAuth';
import { downloadCsv, copyCsvToClipboard } from '@/lib/csv';
import { createBulkEntries } from '@/lib/api/bulk-entry';
import { markCompleted, unmarkCompleted } from '@/lib/api/inspection-form';
import { entryErrorReason } from '@/lib/api/admin-entries';
import { cn, normalizeSearch } from '@/lib/utils';
import { useBulkStore, cancelBulkAutoSave, type BulkRowsPatch } from '@/stores/bulkStore';
import { useInspectionFormStore } from '@/stores/inspectionFormStore';
import { useBulkConfirm } from '@/features/bulk-entry/hooks/useBulkConfirm';
import { useBulkSession } from '@/features/bulk-entry/hooks/useBulkSession';
import { BulkToolbar } from '@/features/bulk-entry/components/BulkToolbar';
import { BulkTable, type BulkRowInfo } from '@/features/bulk-entry/components/BulkTable';
import { BulkFooter } from '@/features/bulk-entry/components/BulkFooter';
import { PasteModal } from '@/features/bulk-entry/modals/PasteModal';
import { RowDetailModal } from '@/features/bulk-entry/modals/RowDetailModal';
import { SaveTemplateModal } from '@/features/bulk-entry/modals/SaveTemplateModal';
import { ManageTemplateModal } from '@/features/bulk-entry/modals/ManageTemplateModal';
import { BulkApplyModal } from '@/features/bulk-entry/modals/BulkApplyModal';
import { parseExcelPaste } from '@/features/bulk-entry/utils/parseExcelPaste';
import { bulkCsvFilename, generateBulkCsv } from '@/features/bulk-entry/utils/bulkCsv';
import { buildBulkEntries } from '@/features/bulk-entry/utils/buildBulkEntries';
import { errorLabel, firstError } from '@/features/bulk-entry/utils/columns';
import { formatInspectedOn, isApplyTarget, scheduleRowInput } from '@/features/bulk-entry/utils/scheduleRows';
import { clearAutoSave } from '@/features/bulk-entry/utils/bulkAutoSave';
import { getStoredTemplates, getVisibleTemplates, templateRows } from '@/features/bulk-entry/utils/bulkTemplates';
import type { BulkEntryRow } from '@/features/bulk-entry/types';
import { usePortalData } from '@/features/inspection-portal/hooks/usePortalData';
import { appliedEntry } from '@/features/inspection-portal/lib/actions';
import { matchTiming, TIMING_OPTIONS, type TimingFilter } from '@/features/inspection-portal/lib/filters';
import {
  buildSchedule,
  focusEntry,
  formatMonth,
  todayJst,
  unscheduledInspections,
  type ScheduleItem,
} from '@/features/inspection-portal/lib/schedule';
import { completionKey, completionKeys, completionMonth, itemStatus } from '@/features/inspection-portal/lib/status';
import { buildUnscheduledItems } from '@/features/inspection-portal/components/UnscheduledTable';
import { ApplyModal, type ApplyTarget } from '@/features/inspection-portal/components/ApplyModal';
import { ReportUploadModal } from '@/features/inspection-documents/components/ReportUploadModal';
import { BulkReportUploadModal } from '@/features/inspection-documents/components/BulkReportUploadModal';
import { BuildingRequestModal } from '@/features/building-requests/components/BuildingRequestModal';
import { ManagementCompanyFilter } from '@/features/single-entry/components/ManagementCompanySelect';
import { useManagementCompanies } from '@/features/single-entry/hooks/useManagementCompanies';
import { MANAGEMENT_COMPANY_NONE } from '@/features/single-entry/lib/entryLogic';
import { compareVendorNames } from '@/lib/vendorOptions';
import type { PortalInspectionRow } from '@/types/portal';

/** v1 の申請失敗メッセージ（message と details をそのまま付ける）。v1: js/bulk-data.js saveAll catch */
function saveErrorMessage(error: unknown): string {
  let msg = '申請に失敗しました';
  const e = error as { message?: string; details?: string } | null;
  if (e?.message) msg += ': ' + e.message;
  if (e?.details) msg += ' (' + e.details + ')';
  return msg;
}

/** トーストに並べる名前の上限（多いときは「ほかN件」にまとめる） */
const MAX_LISTED_NAMES = 5;

function listNames(names: string[]): string {
  const shown = names.slice(0, MAX_LISTED_NAMES).join('、');
  return names.length > MAX_LISTED_NAMES ? `${shown} ほか${names.length - MAX_LISTED_NAMES}件` : shown;
}

/** 予定に出す先の月（点検一覧と同じ: 今月から12か月先まで。既定の時期の絞り込みは3か月先まで） */
const MONTHS_AHEAD = 12;

const smallBtn = 'h-6 rounded border px-1.5 text-[11px] leading-none whitespace-nowrap disabled:opacity-40';

interface ReportTarget {
  inspection: PortalInspectionRow;
  targetMonth: string | null;
  entryId: string | null;
  previous: ScheduleItem['report'];
}

/** 最初のエラーのセルへスクロールしてフォーカスする（B7） */
function focusErrorCell(rowId: number, col: number) {
  setTimeout(() => {
    const tr = document.querySelector(`tr[data-row-id="${rowId}"]`);
    const el =
      tr?.querySelector<HTMLElement>(`[data-col="${col}"]`) ?? tr?.querySelector<HTMLElement>('[data-col]') ?? null;
    tr?.scrollIntoView?.({ block: 'center' });
    el?.focus();
  }, 0);
}

/**
 * 点検登録フォームの一括入力（既定の画面）。上に選択中の保守会社の点検予定（点検行 × 対象月）を出し、
 * ステータス・報告書UP・完了連絡をここで扱う（旧「点検一覧」を吸収。修正依頼1024 B3〜B14）。下は手で足す行。
 * modeSwitch は1件入力・一括入力の切替（フォームの枠の左上に出す）。
 * v1: bulk.html / js/bulk.js
 */
export function BulkEntryPage({ modeSwitch }: { modeSwitch?: ReactNode } = {}) {
  const { addToast } = useToast();
  const { user, isAdmin, vendorId: profileVendorId } = useAuth();
  const { confirm, dialog: confirmDialog } = useBulkConfirm();
  const { ready, vendors, changeVendor, loadFailed, reload } = useBulkSession(confirm);

  const rows = useBulkStore((s) => s.rows);
  const currentVendor = useBulkStore((s) => s.currentVendor);
  const addRow = useBulkStore((s) => s.addRow);
  const addRowWithCopy = useBulkStore((s) => s.addRowWithCopy);
  const duplicateRows = useBulkStore((s) => s.duplicateRows);
  const removeRows = useBulkStore((s) => s.removeRows);
  const clearScheduleInputs = useBulkStore((s) => s.clearScheduleInputs);
  const replaceRows = useBulkStore((s) => s.replaceRows);
  const applyToRows = useBulkStore((s) => s.applyToRows);
  const syncScheduleRows = useBulkStore((s) => s.syncScheduleRows);
  const setInspectionDefaults = useBulkStore((s) => s.setInspectionDefaults);

  // 点検の予定・申請・報告書・完了連絡・検査月（範囲は DB が絞る）
  const portal = usePortalData();
  const today = todayJst();

  // 管理会社フィルター（管理者・保守会社。B2）。1件入力と同じ値
  const managementIndex = useManagementCompanies(true);
  const managementCompanyId = useInspectionFormStore((s) => s.managementCompanyId);
  const setManagementCompanyId = useInspectionFormStore((s) => s.setManagementCompanyId);
  const [timing, setTiming] = useState<TimingFilter>('default');
  const [search, setSearch] = useState('');

  // 管理者が保守会社を選ばないと保守会社名が空で登録できない（DB で弾かれる）ので、申請の前に止めて案内する
  const saveBlockedReason = isAdmin && !currentVendor.id ? 'ヘッダーで保守会社を選んでください' : undefined;

  const [showPaste, setShowPaste] = useState(false);
  const [showBulkApply, setShowBulkApply] = useState(false);
  const [detailRowId, setDetailRowId] = useState<number | null>(null);
  const [showSaveTemplate, setShowSaveTemplate] = useState(false);
  const [showManageTemplate, setShowManageTemplate] = useState(false);
  const [templatesVersion, setTemplatesVersion] = useState(0);
  const [saving, setSaving] = useState(false);
  const [applyTarget, setApplyTarget] = useState<ApplyTarget | null>(null);
  const [reportTarget, setReportTarget] = useState<ReportTarget | null>(null);
  const [showBulkReport, setShowBulkReport] = useState(false);
  const [showBuildingRequest, setShowBuildingRequest] = useState(false);
  const [completingKey, setCompletingKey] = useState<string | null>(null);

  // ---- 点検予定（選択中の保守会社の点検行 × 対象月） ----
  // 保守会社のアカウントは DB が担当の点検（台の保守会社を含む）に絞って返す。管理者は選んだ保守会社の点検だけ（未選択なら出さない）
  const vendorInspections = useMemo(() => {
    if (!isAdmin) return portal.inspections;
    const v = currentVendor.id;
    if (!v) return [];
    return portal.inspections.filter((i) => i.vendor_id === v || i.unit_vendor_ids.includes(v));
  }, [portal.inspections, isAdmin, currentVendor.id]);

  const scheduleItems = useMemo<ScheduleItem[]>(() => {
    const scheduled = buildSchedule(vendorInspections, portal.entries, portal.reports, { today, monthsAhead: MONTHS_AHEAD });
    const unscheduled = buildUnscheduledItems(unscheduledInspections(vendorInspections), portal.entries, portal.reports);
    return [...scheduled, ...unscheduled];
  }, [vendorInspections, portal.entries, portal.reports, today]);
  const itemsByKey = useMemo(() => new Map(scheduleItems.map((i) => [i.key, i])), [scheduleItems]);
  const completed = useMemo(() => completionKeys(portal.completions), [portal.completions]);
  const inspectedOnById = useMemo(
    () => new Map(portal.inspectionDates.map((d) => [d.inspection_id, d.inspected_on])),
    [portal.inspectionDates],
  );

  // 予定を表の行にする（読み込み・保守会社の切り替え・申請のあとに入れ直す）。点検種別の既定（B9）にも点検行を渡す
  useEffect(() => {
    if (!ready || !portal.loaded) return;
    syncScheduleRows(scheduleItems.map(scheduleRowInput));
  }, [ready, portal.loaded, scheduleItems, syncScheduleRows]);
  useEffect(() => {
    setInspectionDefaults({
      vendorInspections: vendorInspections.map((i) => ({ propertyCode: i.property_code, label: i.inspection_type_label ?? '' })),
    });
  }, [vendorInspections, setInspectionDefaults]);

  // ---- 表示の絞り込み（時期は予定の行だけ。物件の検索・管理会社は全部の行） ----
  const managementOf = useCallback(
    (row: BulkEntryRow): string | null | undefined => {
      if (row.schedule) return itemsByKey.get(row.schedule.key)?.inspection.management_company_id ?? null;
      if (!row.propertyCode) return undefined;
      return managementIndex?.byCode.get(String(row.propertyCode)) ?? null;
    },
    [itemsByKey, managementIndex],
  );
  const managementNames = useMemo(
    () => new Map((managementIndex?.companies ?? []).map((c) => [c.id, c.name])),
    [managementIndex],
  );
  const propertyAllowed = useCallback(
    (code: string) => {
      if (!managementCompanyId || !managementIndex) return true;
      const want = managementCompanyId === MANAGEMENT_COMPANY_NONE ? null : managementCompanyId;
      return (managementIndex.byCode.get(code) ?? null) === want;
    },
    [managementCompanyId, managementIndex],
  );
  const propertyNameOf = useCallback(
    (row: BulkEntryRow) =>
      row.schedule?.propertyName ??
      useBulkStore.getState().masterData.properties.find((p) => String(p.propertyCode) === String(row.propertyCode))
        ?.propertyName ??
      '',
    [],
  );
  const isVisible = useCallback(
    (row: BulkEntryRow) => {
      if (row.schedule) {
        const item = itemsByKey.get(row.schedule.key);
        // 時期は点検一覧と同じ（既定は 超過＋今月＋今後3か月。過去の月は超過〔未申請〕だけ）。過去の月の報告書UP・完了連絡は「すべて」で出す
        if (item && item.targetMonth && !matchTiming(item, timing, today)) return false;
        if (item && !item.targetMonth && timing === 'overdue') return false;
      }
      if (managementCompanyId && managementIndex) {
        const m = managementOf(row);
        const want = managementCompanyId === MANAGEMENT_COMPANY_NONE ? null : managementCompanyId;
        // 物件を選んでいない手の行は隠さない
        if (m !== undefined && m !== want) return false;
      }
      const q = normalizeSearch(search);
      if (q && row.propertyCode) {
        if (!normalizeSearch(`${row.propertyCode} ${propertyNameOf(row)}`).includes(q)) return false;
      }
      return true;
    },
    [itemsByKey, timing, today, managementCompanyId, managementIndex, managementOf, search, propertyNameOf],
  );

  // 選択中の保守会社の点検行（手で足した行を点検行に結び付ける・点検月を出すため）
  const inspectionOfManual = useCallback(
    (row: BulkEntryRow) =>
      vendorInspections.find(
        (i) => i.property_code === String(row.propertyCode) && (i.inspection_type_label ?? '') === row.inspectionType,
      ),
    [vendorInspections],
  );

  // ---- 行の操作（報告書UP・完了連絡・再申請） ----
  const openReport = useCallback(
    (item: ScheduleItem) => {
      if (!item.targetMonth) {
        // 点検月の無い点検: 別の月の申請を紐付けない。差戻しの再提出だけは元の報告書の月に揃える（点検一覧と同じ）
        const previous = item.report?.status === 'returned' ? item.report : null;
        setReportTarget({ inspection: item.inspection, targetMonth: previous?.target_month ?? null, entryId: null, previous });
        return;
      }
      setReportTarget({
        inspection: item.inspection,
        targetMonth: item.targetMonth,
        entryId: appliedEntry(item)?.id ?? null,
        // DB が置き換えるのは同じ保守会社の版だけなので、他社の版は前の版にしない（点検一覧と同じ）
        previous: item.report && (isAdmin || item.report.vendor_id === profileVendorId) ? item.report : null,
      });
    },
    [isAdmin, profileVendorId],
  );

  const toggleCompletion = useCallback(
    async (item: ScheduleItem, month: string, undo: boolean) => {
      const subject = `${formatMonth(month)}・${item.inspection.property_name}・${item.inspection.inspection_type_label ?? ''}`;
      const ok = await confirm(
        undo
          ? `完了連絡を取り消しますか？\n${subject}`
          : `点検の完了を連絡しますか？\n${subject}\n報告書が無くても「点検完了」になります（あとで取り消せます）`,
      );
      if (!ok) return;
      const key = completionKey(item.inspection.inspection_id, month);
      setCompletingKey(key);
      try {
        if (undo) await unmarkCompleted(item.inspection.inspection_id, month);
        else await markCompleted(item.inspection.inspection_id, month);
        addToast(undo ? '完了連絡を取り消しました' : '完了を連絡しました', 'success');
        await portal.refetch();
      } catch (err) {
        console.error('Completion failed:', err);
        addToast(`${undo ? '取り消し' : '完了連絡'}に失敗しました: ${entryErrorReason(err)}`, 'error');
      } finally {
        setCompletingKey(null);
      }
    },
    [confirm, addToast, portal],
  );

  const actionsOf = useCallback(
    (item: ScheduleItem): ReactNode => {
      const month = completionMonth(item);
      const key = month ? completionKey(item.inspection.inspection_id, month) : null;
      const hasCompletion = !!key && completed.has(key);
      const accepted = item.report?.status === 'accepted';
      const sentBack = item.application === 'sent_back' ? focusEntry(item.entries) : null;
      const busy = !!key && completingKey === key;
      return (
        <div className="flex flex-wrap gap-1">
          <button
            type="button"
            className={cn(smallBtn, 'border-gray-300 bg-white text-gray-700 hover:bg-gray-100')}
            onClick={() => openReport(item)}
            title="この点検の報告書（PDF）を1件ずつ登録する"
          >
            {item.report?.status === 'returned' ? '報告書を再提出' : '報告書UP'}
          </button>
          {hasCompletion ? (
            <button
              type="button"
              className={cn(smallBtn, 'border-gray-300 bg-white text-gray-500 hover:bg-gray-100')}
              disabled={busy}
              onClick={() => void toggleCompletion(item, month!, true)}
              title="完了連絡を取り消す"
            >
              完了取消
            </button>
          ) : (
            !accepted && (
              <button
                type="button"
                className={cn(smallBtn, 'border-green-400 bg-green-50 text-green-800 hover:bg-green-100')}
                disabled={busy || !month}
                onClick={() => month && void toggleCompletion(item, month, false)}
                title={month ? '点検の完了を連絡する（報告書が無くても点検完了になります）' : '申請してから完了を連絡できます（対象月が決まらないため）'}
              >
                完了連絡
              </button>
            )
          )}
          {sentBack && (
            <button
              type="button"
              className={cn(smallBtn, 'border-blue-400 bg-blue-50 text-blue-800 hover:bg-blue-100')}
              onClick={() =>
                setApplyTarget({ inspection: item.inspection, targetMonth: item.targetMonth || null, resubmit: sentBack })
              }
            >
              修正して再申請
            </button>
          )}
        </div>
      );
    },
    [completed, completingKey, openReport, toggleCompletion],
  );

  const infoOf = useCallback(
    (row: BulkEntryRow): BulkRowInfo => {
      if (row.schedule) {
        const item = itemsByKey.get(row.schedule.key);
        if (item) {
          const status = itemStatus(item, completed, today);
          const sentBack = item.application === 'sent_back' ? focusEntry(item.entries)?.review_comment : null;
          const reason = status === 'report_returned' ? item.report?.review_comment : status === 'sent_back' ? sentBack : null;
          return {
            status,
            reason: reason ?? null,
            managementName: item.inspection.management_company_name ?? '',
            vendorName: item.inspection.vendor_name ?? '',
            months: item.inspection.inspection_months.join(','),
            inspectedOn: formatInspectedOn(inspectedOnById.get(item.inspection.inspection_id)),
            actions: actionsOf(item),
          };
        }
      }
      const m = row.propertyCode ? managementIndex?.byCode.get(String(row.propertyCode)) : null;
      const linked = row.propertyCode ? inspectionOfManual(row) : undefined;
      return {
        managementName: m ? (managementNames.get(m) ?? '') : '',
        vendorName: currentVendor.name ?? '',
        months: linked ? linked.inspection_months.join(',') : '',
        inspectedOn: formatInspectedOn(linked ? inspectedOnById.get(linked.inspection_id) : null),
      };
    },
    [itemsByKey, completed, today, inspectedOnById, actionsOf, managementIndex, inspectionOfManual, managementNames, currentVendor.name],
  );

  // 一括設定は今見えている選択行（申請済みの予定を除く）だけに入れる（隠れた行を黙って上書きしない）
  const selectableIds = useCallback(
    () => {
      const { rows: all, selectedIds } = useBulkStore.getState();
      return all.filter((r) => selectedIds.has(r.id) && isVisible(r) && !r.schedule?.locked).map((r) => r.id);
    },
    [isVisible],
  );
  const selectedCount = useBulkStore((s) => s.selectedIds.size);
  const visibleSelectedCount = useMemo(
    () => rows.filter((r) => useBulkStore.getState().selectedIds.has(r.id) && isVisible(r) && !r.schedule?.locked).length,
    // selectedCount で選択の変化に合わせて数え直す
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [rows, isVisible, selectedCount],
  );

  // 選択中の保守会社のテンプレート＋全社共通。v1: js/bulk-modals.js loadTemplates
  const templates = useMemo(() => {
    void templatesVersion;
    return getVisibleTemplates(currentVendor.id);
  }, [currentVendor.id, templatesVersion]);
  const refreshTemplates = useCallback(() => setTemplatesVersion((v) => v + 1), []);

  // v1: js/bulk-table.js duplicateSelectedRows（並びは duplicateRows が表の順に揃える。予定の行を複製すると手の行になる）
  const handleDuplicate = useCallback(() => {
    const ids = [...useBulkStore.getState().selectedIds];
    if (ids.length === 0) {
      addToast('複製する行を選択してください', 'error');
      return;
    }
    duplicateRows(ids);
    addToast(`${ids.length}件の行を複製しました`, 'success');
  }, [duplicateRows, addToast]);

  // v1: js/bulk-table.js deleteSelectedRows。点検予定の行は消せない（点検開始日を空にすると申請されない）
  const handleDeleteSelected = useCallback(async () => {
    const { rows: all, selectedIds } = useBulkStore.getState();
    const ids = all.filter((r) => selectedIds.has(r.id) && !r.schedule).map((r) => r.id);
    if (ids.length === 0) {
      addToast(
        selectedIds.size > 0 ? '点検予定の行は削除できません（点検開始日を空にすると申請されません）' : '削除する行を選択してください',
        'error',
      );
      return;
    }
    if (!(await confirm(`${ids.length}件の行を削除しますか？`))) return;
    removeRows(ids);
    addToast(`${ids.length}件の行を削除しました`, 'success');
  }, [removeRows, addToast, confirm]);

  // v1: js/bulk-modals.js importFromPaste
  const handleImport = (raw: string): boolean => {
    if (!raw.trim()) {
      addToast('データを入力してください', 'error');
      return false;
    }
    const { rows: parsed, unresolvedCount, unresolvedNames, errorCount } = parseExcelPaste(
      raw,
      useBulkStore.getState().masterData.properties,
    );
    parsed.forEach((r) => addRow(r));
    setShowPaste(false);
    if (parsed.length > 0) addToast(`${parsed.length}件のデータを取り込みました`, 'success');
    if (unresolvedCount > 0) {
      // どの名前が合わなかったかを並べる（行の物件セルにも「未一致: ○○」と出る）
      addToast(
        `${unresolvedCount}件は物件名が見つかりませんでした。行を確認してください\n見つからなかった名前: ${listNames(unresolvedNames)}`,
        'error',
      );
    }
    if (errorCount > 0) addToast(`${errorCount}件の不正な行をスキップしました`, 'error');
    return true;
  };

  // v1: js/bulk-modals.js applyTemplate（点検予定の行は残す）
  const handleApplyTemplate = async (id: string) => {
    const template = getStoredTemplates().find((t) => t.id === id);
    if (!template) return;
    if (useBulkStore.getState().rows.some((r) => !r.schedule) && !(await confirm('現在のデータを置き換えますか？'))) return;
    replaceRows(templateRows(template));
    addToast(`テンプレート「${template.name}」を適用しました`, 'success');
  };

  // 選択行への一括設定（入れた項目だけ上書き）
  const handleBulkApply = (patch: BulkRowsPatch) => {
    const ids = selectableIds();
    applyToRows(ids, patch);
    setShowBulkApply(false);
    addToast(`${ids.length}件の行に設定しました`, 'success');
  };

  /** 申請・CSV の対象（手で足した行と、点検開始日を入れた未申請の予定の行のうち、表示中のもの） */
  const applyTargets = () => useBulkStore.getState().rows.filter((r) => isApplyTarget(r) && isVisible(r));

  // 申請。エラーの行があれば止めて、件数と最初のエラーを知らせ、そのセルへ移る（B7）。
  // 点検開始日を入れていない予定の行は黙って飛ばす。v1: js/bulk-data.js saveAll
  const handleSave = async () => {
    const { masterData, currentVendor: vendor, appSettings, userId, rows: all } = useBulkStore.getState();
    const targets = applyTargets();
    if (targets.length === 0) {
      addToast('申請するデータがありません（予定の行は点検開始日を入れると申請の対象になります）', 'error');
      return;
    }
    if (saveBlockedReason) {
      addToast(saveBlockedReason, 'error');
      return;
    }
    const errorRows = targets.filter((r) => !r.isValid);
    if (errorRows.length > 0) {
      const first = firstError(errorRows)!;
      // 表の No と同じ（表示中の行の通し番号）
      const rowNo = all.filter(isVisible).findIndex((r) => r.id === first.rowId) + 1;
      addToast(
        `入力にエラーがある行が${errorRows.length}件あります。直してから申請してください\n${rowNo}行目: ${errorLabel(first.message)}`,
        'error',
      );
      focusErrorCell(first.rowId, first.col);
      return;
    }
    const hidden = all.filter((r) => isApplyTarget(r) && !isVisible(r)).length;
    setSaving(true);
    try {
      await createBulkEntries(buildBulkEntries(targets, masterData, vendor, appSettings, vendorInspections), userId ?? '');
      cancelBulkAutoSave();
      clearAutoSave(userId);
      // 申請した手の行だけ消す（申請中に足した行・絞り込みで隠れていた行は残り、removeRows が残りの行で自動保存を書き直す）。
      // 予定の行は入力を空に戻す（読み直しで申請済みの行になる。点検月未登録の行は未申請のまま残るので二重に申請させない）
      const manualIds = targets.filter((r) => !r.schedule).map((r) => r.id);
      const scheduleIds = targets.filter((r) => r.schedule).map((r) => r.id);
      addToast(
        hidden > 0
          ? `${targets.length}件のデータを申請しました\n絞り込みで隠れている${hidden}件は申請していません`
          : `${targets.length}件のデータを申請しました`,
        'success',
      );
      clearScheduleInputs(scheduleIds);
      removeRows(manualIds);
      void portal.refetch();
    } catch (error) {
      console.error('Save failed:', error);
      addToast(saveErrorMessage(error), 'error');
    } finally {
      setSaving(false);
    }
  };

  // v1: js/bulk-data.js downloadCSV
  const handleDownloadCsv = () => {
    const { masterData, currentVendor: vendor, appSettings } = useBulkStore.getState();
    const csv = generateBulkCsv(applyTargets(), masterData, vendor, appSettings);
    if (!csv) {
      addToast('ダウンロードするデータがありません', 'error');
      return;
    }
    downloadCsv(csv, bulkCsvFilename());
    addToast('CSVをダウンロードしました', 'success');
  };

  // v1: js/bulk-data.js copyCSV（BOM なし）
  const handleCopyCsv = async () => {
    const { masterData, currentVendor: vendor, appSettings } = useBulkStore.getState();
    const csv = generateBulkCsv(applyTargets(), masterData, vendor, appSettings);
    if (!csv) {
      addToast('コピーするデータがありません', 'error');
      return;
    }
    try {
      await copyCsvToClipboard(csv);
      addToast('CSVをクリップボードにコピーしました', 'success');
    } catch (error) {
      console.error('Clipboard write failed:', error);
      addToast('コピーに失敗しました', 'error');
    }
  };

  // キーボードショートカット。v1: js/bulk.js handleGlobalKeyDown（Escape はモーダル・メニューが自分で閉じる）
  // 読み込みが済むまでは登録しない（v1: js/bulk.js init は読み込み後に setupEventListeners）
  useEffect(() => {
    if (!ready) return;
    const handler = (e: KeyboardEvent) => {
      if (e.ctrlKey && e.key === 'Enter') {
        e.preventDefault();
        addRowWithCopy();
      }
      if (e.ctrlKey && e.key === 'd') {
        e.preventDefault();
        handleDuplicate();
      }
      const target = e.target as HTMLElement | null;
      if (e.key === 'Delete' && !target?.matches('input, textarea, select')) {
        e.preventDefault();
        void handleDeleteSelected();
      }
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [ready, addRowWithCopy, handleDuplicate, handleDeleteSelected]);

  const filters = (
    <>
      <select
        aria-label="時期"
        value={timing}
        onChange={(e) => setTiming(e.target.value as TimingFilter)}
        className="h-7 rounded border border-gray-300 bg-white px-1.5 text-xs"
        title="点検予定の行の時期（手で足した行は常に出す）"
      >
        {TIMING_OPTIONS.map((o) => (
          <option key={o.value} value={o.value}>
            時期: {o.label}
          </option>
        ))}
      </select>
      <input
        type="search"
        aria-label="物件名・コードで検索"
        placeholder="物件名・コード"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        className="h-7 w-36 rounded border border-gray-300 bg-white px-1.5 text-xs"
      />
      {portal.loading && <Spinner size="sm" />}
    </>
  );

  return (
    // tall（幅 1024 以上・高さ 760 以上）のときだけ画面の高さに合わせ、表の部分だけをスクロールさせる。
    // main の上下の余白（py-3 = 1.5rem）を引く
    <div className="flex flex-col gap-2 tall:h-[calc(100dvh-var(--header-h)-1.5rem)]">
      <h1 className="sr-only">点検登録フォーム（一括入力）</h1>
      {/* 管理者の保守会社選択（B1: バッジは『保守会社』）と管理会社フィルター（管理者・保守会社。B2）はヘッダーに出す */}
      <HeaderSlot>
        <div className="flex items-center gap-2">
          {isAdmin && (
            <div className="inline-flex items-center gap-2 rounded-md border-[1.5px] border-amber-400 bg-amber-50 px-2 py-1">
              <span className="whitespace-nowrap rounded bg-amber-400 px-1.5 py-0.5 text-[11px] font-bold text-slate-800">
                保守会社
              </span>
              <select
                aria-label="保守会社を選択"
                value={currentVendor.id ?? ''}
                onChange={(e) => void changeVendor(e.target.value)}
                className="max-w-[20rem] rounded border border-amber-400 bg-white px-1.5 py-1 text-sm text-slate-800"
              >
                <option value="">-- 保守会社を選択 --</option>
                {[...vendors].sort((a, b) => compareVendorNames(a.vendorName, b.vendorName)).map((v) => (
                  <option key={v.id} value={v.id}>
                    {v.vendorName}
                  </option>
                ))}
              </select>
            </div>
          )}
          {managementIndex && (
            <ManagementCompanyFilter
              companies={managementIndex.companies}
              value={managementCompanyId}
              onChange={setManagementCompanyId}
            />
          )}
        </div>
      </HeaderSlot>

      <Card className="flex flex-col overflow-hidden tall:min-h-0 tall:flex-1">
        <BulkToolbar
          disabled={!ready}
          leading={modeSwitch}
          filters={filters}
          templates={templates}
          onAddRow={addRowWithCopy}
          onDuplicate={handleDuplicate}
          onDeleteSelected={() => void handleDeleteSelected()}
          onOpenBulkApply={() => setShowBulkApply(true)}
          onOpenPaste={() => setShowPaste(true)}
          onOpenBulkReport={() => setShowBulkReport(true)}
          onOpenBuildingRequest={() => setShowBuildingRequest(true)}
          onApplyTemplate={(id) => void handleApplyTemplate(id)}
          onOpenSaveTemplate={() => setShowSaveTemplate(true)}
          onOpenManageTemplate={() => setShowManageTemplate(true)}
        />
        {portal.error && (
          <div className="flex items-center gap-2 border-b border-gray-200 px-3 py-1 text-xs text-red-600">
            <span>点検の予定を読み込めませんでした（{portal.error}）</span>
            <Button variant="secondary" size="sm" className="px-2 py-0.5 text-xs" onClick={() => void portal.refetch()}>
              再読み込み
            </Button>
          </div>
        )}
        {isAdmin && !currentVendor.id && ready && (
          <p className="border-b border-gray-200 px-3 py-1 text-xs text-amber-700">
            保守会社を選ぶと、その保守会社の点検予定（ステータス・報告書UP・完了連絡）が表に出ます。
          </p>
        )}

        {/* 行が増えても申請ボタンが画面外に出ないよう、表の部分だけスクロールさせる（v1.30.1）。
            12.5rem は main の上下の余白・ツールバー（狭い幅で 2 行に折り返したとき）・申請の行のぶん。
            tall のときは Card の残りの高さをすべて使う（max-h と min-h は外す） */}
        <div
          className="max-h-[calc(100dvh-var(--header-h)-12.5rem)] min-h-[12rem] overflow-auto tall:max-h-none tall:min-h-0 tall:flex-1"
          data-testid="bulk-table-container"
        >
          {rows.length === 0 && !ready ? (
            // 読み込み中・失敗を「データがありません」と区別する（失敗したらその場で読み直せるようにする）
            <div className="flex flex-col items-center justify-center gap-2 p-8 text-center">
              {loadFailed ? (
                <>
                  <h3 className="font-semibold text-red-700">マスターデータを読み込めませんでした</h3>
                  <p className="text-sm text-gray-500">通信状態を確認して、もう一度読み込んでください</p>
                  <Button onClick={reload}>再読み込み</Button>
                </>
              ) : (
                <>
                  <Spinner />
                  <p className="text-sm text-gray-500">マスターデータを読み込み中…</p>
                </>
              )}
            </div>
          ) : rows.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-2 p-8 text-center">
              <h3 className="font-semibold text-gray-700">データがありません</h3>
              <p className="text-sm text-gray-500">「行を追加」または「Excelから取込」で入力を開始してください</p>
              <Button onClick={addRowWithCopy} disabled={!ready}>
                行を追加して始める
              </Button>
            </div>
          ) : (
            <BulkTable
              onOpenRowDetail={setDetailRowId}
              confirm={confirm}
              isVisible={isVisible}
              propertyAllowed={propertyAllowed}
              infoOf={infoOf}
              showManagement
              showVendor={isAdmin}
            />
          )}
        </div>

        <BulkFooter
          saving={saving}
          onSave={() => void handleSave()}
          onDownloadCsv={handleDownloadCsv}
          onCopyCsv={() => void handleCopyCsv()}
          saveBlockedReason={saveBlockedReason}
        />
      </Card>

      <BulkApplyModal
        open={showBulkApply}
        onClose={() => setShowBulkApply(false)}
        onApply={handleBulkApply}
        selectedCount={visibleSelectedCount}
        hiddenSelectedCount={selectedCount - visibleSelectedCount}
      />
      <PasteModal open={showPaste} onClose={() => setShowPaste(false)} onImport={handleImport} />
      <RowDetailModal open={detailRowId !== null} onClose={() => setDetailRowId(null)} rowId={detailRowId} />
      <SaveTemplateModal
        open={showSaveTemplate}
        onClose={() => setShowSaveTemplate(false)}
        onSaved={refreshTemplates}
      />
      <ManageTemplateModal
        open={showManageTemplate}
        onClose={() => setShowManageTemplate(false)}
        templates={templates}
        onChanged={refreshTemplates}
        confirm={confirm}
      />
      {/* 差戻しの再申請だけで使う。マスタを丸ごと読むので、開くときだけ置く（一括入力のマスタと二重に読まない） */}
      {applyTarget && (
        <ApplyModal
          target={applyTarget}
          onClose={() => setApplyTarget(null)}
          onApplied={() => void portal.refetch()}
          userId={user?.id ?? null}
          isAdmin={isAdmin}
          profileVendorId={profileVendorId ?? null}
        />
      )}
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
      <BulkReportUploadModal
        open={showBulkReport}
        onClose={() => setShowBulkReport(false)}
        vendorId={currentVendor.id}
        onUploaded={() => void portal.refetch()}
      />
      <BuildingRequestModal
        open={showBuildingRequest}
        onClose={() => setShowBuildingRequest(false)}
        vendorId={currentVendor.id}
        managementCompanyId={
          managementCompanyId && managementCompanyId !== MANAGEMENT_COMPANY_NONE ? managementCompanyId : null
        }
      />
      {confirmDialog}
    </div>
  );
}
