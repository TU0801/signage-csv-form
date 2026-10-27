import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { HeaderSlot } from '@/components/layout/HeaderSlot';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Spinner } from '@/components/ui/Spinner';
import { useToast } from '@/components/ui/Toast';
import { useAuth } from '@/hooks/useAuth';
import { downloadCsv, copyCsvToClipboard } from '@/lib/csv';
import { createBulkEntries } from '@/lib/api/bulk-entry';
import { fetchEntryMemos, markCompleted, unmarkCompleted } from '@/lib/api/inspection-form';
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
import {
  defaultInspectionType,
  formatInspectedOn,
  isApplyTarget,
  scheduleRowEntry,
  scheduleRowInput,
  submittedEntryPatch,
} from '@/features/bulk-entry/utils/scheduleRows';
import { clearAutoSave } from '@/features/bulk-entry/utils/bulkAutoSave';
import { getStoredTemplates, getVisibleTemplates, templateRows } from '@/features/bulk-entry/utils/bulkTemplates';
import {
  discardImagesDroppedBy,
  discardUnheldRowImages,
  rowPosterImages,
} from '@/features/bulk-entry/utils/discardRowImages';
import type { BulkEntryRow } from '@/features/bulk-entry/types';
import { usePortalData } from '@/features/inspection-portal/hooks/usePortalData';
import { inspectionsOfVendor } from '@/features/inspection-portal/lib/inspectionLink';
import { completionBlockedReason, reportDefaultPerformedOn, reportEntryId } from '@/features/inspection-portal/lib/actions';
import { matchTiming, TIMING_OPTIONS, type TimingFilter } from '@/features/inspection-portal/lib/filters';
import {
  buildSchedule,
  focusEntry,
  formatInspectionMonths,
  formatMonth,
  todayJst,
  typeFlagsMap,
  unscheduledInspections,
  type ScheduleItem,
} from '@/features/inspection-portal/lib/schedule';
import { buildNotifyOffIndex, buildUnitIndex, expandByUnits } from '@/features/inspection-portal/lib/units';
import { useManagementShortNames } from '@/features/inspection-portal/hooks/useManagementShortNames';
import { orderRows, type SortState } from '@/features/bulk-entry/utils/rowOrder';
import {
  completionKey,
  completionKeys,
  completionMonth,
  isRowCompleted,
  itemStatus,
  rowCompletionKey,
  rowUndoCompletionUnitIds,
} from '@/features/inspection-portal/lib/status';
import { buildUnscheduledItems } from '@/features/inspection-portal/components/UnscheduledTable';
import { ApplyModal, type ApplyTarget } from '@/features/inspection-portal/components/ApplyModal';
import { ReportUploadModal } from '@/features/inspection-documents/components/ReportUploadModal';
import { BulkReportUploadModal } from '@/features/inspection-documents/components/BulkReportUploadModal';
import { OtherFileUploadModal } from '@/features/inspection-documents/components/OtherFileUploadModal';
import { BuildingRequestModal } from '@/features/building-requests/components/BuildingRequestModal';
import { useProvisionalBuildings } from '@/features/building-requests/hooks/useProvisionalBuildings';
import { isProvisionalCode, provisionalCode } from '@/features/building-requests/lib/provisional';
import type { DbEntry, DbPropertyRequest } from '@/types/database';
import { fetchSubmittedEntryForEdit, updateSubmittedEntry } from '@/lib/api/portal';
import { ManagementCompanyFilter } from '@/features/single-entry/components/ManagementCompanySelect';
import { useManagementCompanies } from '@/features/single-entry/hooks/useManagementCompanies';
import { MANAGEMENT_COMPANY_NONE } from '@/features/single-entry/lib/entryLogic';
import { compareVendorNames } from '@/lib/vendorOptions';
import type { PortalEntryRow, PortalInspectionRow } from '@/types/portal';

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
  /** 実施日の既定（行の点検開始日。修正依頼1027(1)） */
  defaultPerformedOn?: string | null;
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
  const { addToast, dismissToast } = useToast();
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

  // 申請のエラーのトースト（× を押すまで残る）。行のエラーはその行を直した・消したとき、どれも次に申請できたときと
  // 一括入力の画面を離れた（1件入力へ切り替えた）ときに消す（修正依頼1024 本番確認: 直した後も数分残っていた）
  const saveErrorToasts = useRef<{ id: string; rowId: number | null }[]>([]);
  const showSaveError = useCallback(
    (message: string, rowId: number | null = null) => {
      saveErrorToasts.current.push({ id: addToast(message, 'error'), rowId });
    },
    [addToast],
  );
  const dismissSaveErrors = useCallback(() => {
    saveErrorToasts.current.forEach((t) => dismissToast(t.id));
    saveErrorToasts.current = [];
  }, [dismissToast]);
  useEffect(() => dismissSaveErrors, [dismissSaveErrors]);
  useEffect(() => {
    saveErrorToasts.current = saveErrorToasts.current.filter((t) => {
      if (t.rowId === null) return true;
      const row = rows.find((r) => r.id === t.rowId);
      if (row && !row.isValid) return true;
      dismissToast(t.id);
      return false;
    });
  }, [rows, dismissToast]);

  // 点検の予定・申請・報告書・完了連絡・検査月（範囲は DB が絞る）
  const portal = usePortalData();
  const today = todayJst();

  // 管理会社フィルター（管理者・保守会社。B2）。1件入力と同じ値
  const managementIndex = useManagementCompanies(true);
  const managementCompanyId = useInspectionFormStore((s) => s.managementCompanyId);
  const setManagementCompanyId = useInspectionFormStore((s) => s.setManagementCompanyId);
  const [timing, setTiming] = useState<TimingFilter>('default');
  // 点検月のみ（既定）／全ての月（点検月以外の月にも予定の行を出す。修正依頼1025 D5）
  const [allMonths, setAllMonths] = useState(false);
  const [search, setSearch] = useState('');
  // 申請不要（報告書のみ）の予定の行も出すか（既定は出さない。修正依頼1027）
  const [showReportOnly, setShowReportOnly] = useState(false);
  // 予定の行の並べ替え（F3。表示だけ）
  const [sort, setSort] = useState<SortState | null>(null);
  // 管理会社の略称（F5）
  const shortNames = useManagementShortNames();

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
  const [showOtherFile, setShowOtherFile] = useState(false);
  const [showBuildingRequest, setShowBuildingRequest] = useState(false);
  const [completingKey, setCompletingKey] = useState<string | null>(null);

  // 未承認の建物（建物追加の申請。修正依頼1025 F2）: 申請した月の間は物件の候補に出し、申請まで送れる
  const provisional = useProvisionalBuildings(currentVendor.id, ready);
  // 申請した建物の行を『＋行を追加』と同じ手の行で足す（点検種別は申請のもの、無ければ保守会社の既定）。
  // 管理者がモーダルで別の保守会社を選んだときは、いま入力している保守会社の行ではないので足さない
  const tableRef = useRef<HTMLDivElement>(null);
  const handleBuildingRequested = useCallback(
    (request: DbPropertyRequest) => {
      if (!currentVendor.id || request.vendor_id !== currentVendor.id) return;
      provisional.addRequest(request);
      const { masterData, inspectionDefaults } = useBulkStore.getState();
      const code = provisionalCode(request.id);
      const label =
        masterData.notices.find((n) => n.id && n.id === request.inspection_type_id)?.inspectionType ||
        defaultInspectionType(code, [], inspectionDefaults.linkedIds, masterData.notices);
      // 『＋行を追加』と同じく表の一番上に入れ、表を上へ戻す（F1）
      addRow({ propertyCode: code, inspectionType: label }, true);
      setTimeout(() => tableRef.current?.scrollTo?.({ top: 0 }), 0);
    },
    [currentVendor.id, provisional, addRow],
  );

  // ---- 点検予定（選択中の保守会社の点検行 × 対象月） ----
  // 保守会社のアカウントは DB が担当の点検（台の保守会社を含む）に絞って返す。管理者は選んだ保守会社の点検だけ（未選択なら出さない）
  const vendorInspections = useMemo(
    () => inspectionsOfVendor(portal.inspections, isAdmin, currentVendor.id),
    [portal.inspections, isAdmin, currentVendor.id],
  );

  // 点検種別の印（申請不要・毎月。H4/G4）と号機（台。H1〜H3）
  const flags = useMemo(() => typeFlagsMap(portal.typeFlags), [portal.typeFlags]);
  const unitIndex = useMemo(() => buildUnitIndex(portal.units), [portal.units]);
  // 点検日連絡が OFF の点検・台は申請不要（報告書のみ。修正依頼1026）
  const notifyIndex = useMemo(() => buildNotifyOffIndex(portal.notifyOff), [portal.notifyOff]);
  // 台を絞る保守会社（保守会社のアカウントは自社、管理者は選んだ保守会社）
  const unitVendorId = isAdmin ? currentVendor.id : (profileVendorId ?? null);

  const scheduleItems = useMemo<ScheduleItem[]>(() => {
    const scheduled = buildSchedule(vendorInspections, portal.entries, portal.reports, {
      today,
      monthsAhead: MONTHS_AHEAD,
      flags,
      allMonths,
    });
    const unscheduled = buildUnscheduledItems(
      unscheduledInspections(vendorInspections, flags),
      portal.entries,
      portal.reports,
      flags,
    );
    // 台が2台以上の点検は台ごとの行に分ける（申請・完了連絡は台ごと、報告書UP は1台目の行だけ。修正依頼1026 I7）
    return expandByUnits([...scheduled, ...unscheduled], unitIndex, unitVendorId, { notify: notifyIndex });
  }, [vendorInspections, portal.entries, portal.reports, today, flags, allMonths, unitIndex, unitVendorId, notifyIndex]);
  const itemsByKey = useMemo(() => new Map(scheduleItems.map((i) => [i.key, i])), [scheduleItems]);
  const completed = useMemo(() => completionKeys(portal.completions), [portal.completions]);
  const inspectedOnById = useMemo(
    () => new Map(portal.inspectionDates.map((d) => [d.inspection_id, d.inspected_on])),
    [portal.inspectionDates],
  );

  // 申請済みの予定の行に出すメモ（B12。portal_entries はメモを返さないので、読み取りの行の申請だけ別に読む）
  // 更新日時も鍵に入れる（申請済みの申請を修正したときに、同じ id のメモを読み直す。修正依頼1026 I11）
  const lockedEntryKey = useMemo(
    () =>
      [
        ...new Set(
          scheduleItems
            .map((i) => scheduleRowEntry(i))
            .filter((e): e is PortalEntryRow => !!e)
            .map((e) => `${e.id}@${e.updated_at ?? ''}`),
        ),
      ]
        .sort()
        .join(','),
    [scheduleItems],
  );
  const [entryMemos, setEntryMemos] = useState<ReadonlyMap<string, string>>(() => new Map());
  useEffect(() => {
    if (!lockedEntryKey) return;
    let cancelled = false;
    fetchEntryMemos(lockedEntryKey.split(',').map((k) => k.split('@')[0]!))
      .then((memos) => {
        if (!cancelled) setEntryMemos(memos);
      })
      // メモが読めなくても表は出す（メモの欄が「－」になるだけ）
      .catch((err) => console.error('Failed to load entry memos:', err));
    return () => {
      cancelled = true;
    };
  }, [lockedEntryKey]);

  // 申請済み（承認前）の申請を修正している予定の行（修正依頼1026 I11）。予定の key → 申請の行全体。
  // 読み直しでその申請が承認・差戻しされていたら（行の申請が変わったら）修正をやめる
  const [editing, setEditing] = useState<ReadonlyMap<string, DbEntry>>(() => new Map());
  const editOf = useCallback(
    (item: ScheduleItem): DbEntry | null => {
      const edit = editing.get(item.key);
      if (!edit) return null;
      const entry = scheduleRowEntry(item);
      return entry && entry.id === edit.id && entry.status === 'draft' ? edit : null;
    },
    [editing],
  );

  // 予定を表の行にする（読み込み・保守会社の切り替え・申請のあとに入れ直す）。点検種別の既定（B9）にも点検行を渡す
  useEffect(() => {
    if (!ready || !portal.loaded) return;
    // 予定から外れた行（予定の変更など）が持っていた画像は片付ける
    discardImagesDroppedBy(() =>
      syncScheduleRows(scheduleItems.map((item) => scheduleRowInput(item, entryMemos, editOf(item)))),
    );
  }, [ready, portal.loaded, scheduleItems, entryMemos, editOf, syncScheduleRows]);
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
      const code = String(row.propertyCode);
      if (isProvisionalCode(code)) return provisional.companyByCode.get(code) ?? null;
      return managementIndex?.byCode.get(code) ?? null;
    },
    [itemsByKey, managementIndex, provisional.companyByCode],
  );
  const managementNames = useMemo(
    () => new Map((managementIndex?.companies ?? []).map((c) => [c.id, c.name])),
    [managementIndex],
  );
  // 管理会社の列に出す名前（略称。未登録・読めなければ正式名。F5）
  const managementLabel = useCallback(
    (id: string | null | undefined, fullName: string) => (id ? (shortNames.get(id) ?? fullName) : fullName),
    [shortNames],
  );
  const propertyAllowed = useCallback(
    (code: string) => {
      if (!managementCompanyId || !managementIndex) return true;
      const want = managementCompanyId === MANAGEMENT_COMPANY_NONE ? null : managementCompanyId;
      const company = isProvisionalCode(code) ? provisional.companyByCode.get(code) : managementIndex.byCode.get(code);
      return (company ?? null) === want;
    },
    [managementCompanyId, managementIndex, provisional.companyByCode],
  );
  const propertyNameOf = useCallback(
    (row: BulkEntryRow) =>
      row.schedule?.propertyName ??
      useBulkStore.getState().masterData.properties.find((p) => String(p.propertyCode) === String(row.propertyCode))
        ?.propertyName ??
      '',
    [],
  );
  // 申請不要の切り替えより前の絞り込み（時期・管理会社・検索）。隠した申請不要の件数を数えるのにも使う
  const passesFilters = useCallback(
    (row: BulkEntryRow) => {
      if (row.schedule) {
        const item = itemsByKey.get(row.schedule.key);
        // 画面に戻った直後（点検の予定の読み込み中）は、前に入れた予定の行を時期で絞れず印も無いので出さない。
        // 読み込めたら予定の行は入れ直される。読み込みに失敗したときは前の行を出したまま（修正依頼1025 N6）
        if (!item && !portal.loaded && !portal.error) return false;
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
    [itemsByKey, portal.loaded, portal.error, timing, today, managementCompanyId, managementIndex, managementOf, search, propertyNameOf],
  );
  // 申請不要（種別の報告書のみ・点検日連絡 OFF）の予定の行か。台ごとの点検日連絡を反映した予定（itemsByKey）で見る
  const isReportOnlyRow = useCallback(
    (row: BulkEntryRow) => !!row.schedule && !!(itemsByKey.get(row.schedule.key)?.reportOnly ?? row.schedule.reportOnly),
    [itemsByKey],
  );
  // 表示する行。申請不要の行は「申請不要も表示」のときだけ出す（修正依頼1027）。隠した行は選択・一括設定・申請・CSV の対象にならない
  const isVisible = useCallback(
    (row: BulkEntryRow) => passesFilters(row) && (showReportOnly || !isReportOnlyRow(row)),
    [passesFilters, showReportOnly, isReportOnlyRow],
  );
  const hiddenReportOnlyCount = useMemo(
    () => (showReportOnly ? 0 : rows.filter((r) => isReportOnlyRow(r) && passesFilters(r)).length),
    [rows, showReportOnly, isReportOnlyRow, passesFilters],
  );
  const toggleShowReportOnly = (next: boolean) => {
    setShowReportOnly(next);
    // 隠す行の選択は外す（隠れたまま一括の操作の対象に残さない）
    if (!next) {
      const { rows: all, selectedIds, toggleSelection } = useBulkStore.getState();
      all.filter((r) => selectedIds.has(r.id) && isReportOnlyRow(r)).forEach((r) => toggleSelection(r.id));
    }
  };

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
        entryId: reportEntryId(item),
        defaultPerformedOn: reportDefaultPerformedOn(item),
        // 自社（管理者は全社）の版があれば再提出として開く（点検一覧と同じ。報告書は追加。修正依頼1027 決定①）
        previous: item.report && (isAdmin || item.report.vendor_id === profileVendorId) ? item.report : null,
      });
    },
    [isAdmin, profileVendorId],
  );

  // unitIds: 記録・取り消しする完了連絡の台（台ごとの行は台、台なしの完了連絡は null）。記録は1つ。取り消しは
  // その行を完了にしている完了連絡すべて（台ごとと台なしが両方あれば両方。修正依頼1026 後続）
  const toggleCompletion = useCallback(
    async (item: ScheduleItem, month: string, undo: boolean, unitIds: (string | null)[]) => {
      const unit = item.unit && item.unitCode ? `・${item.unitCode}` : '';
      const subject = `${formatMonth(month)}・${item.inspection.property_name}${unit}・${item.inspection.inspection_type_label ?? ''}`;
      // 台ごとの行で台なしの完了連絡（点検の全体）を取り消すと、ほかの台の行の完了も外れる
      const unitlessOnUnitRow = !!item.unit && unitIds.includes(null);
      // 「も」は台の完了連絡と一緒に取り消すときだけ（台なしだけならそれを取り消す）
      const alsoUnit = unitIds.some((u) => u !== null);
      const ok = await confirm(
        undo
          ? `完了連絡を取り消しますか？\n${subject}` +
              (unitlessOnUnitRow
                ? `\nこの点検全体（台なし）の完了連絡${alsoUnit ? 'も' : 'を'}取り消すため、ほかの台の行の「点検完了」も外れます`
                : '')
          : `点検の完了を連絡しますか？\n${subject}\n報告書が無くても「点検完了」になります（あとで取り消せます）`,
      );
      if (!ok) return;
      const id = item.inspection.inspection_id;
      const key = completionKey(id, month, item.unit?.unit_id);
      setCompletingKey(key);
      try {
        if (!undo) {
          await markCompleted(id, month, unitIds[0] ?? null);
          addToast('完了を連絡しました', 'success');
          await portal.refetch();
          return;
        }
        // 台が先に1つずつ取り消す。台の完了連絡が断られたら台なしは取り消さない（この行は完了のまま残るので、
        // ほかの台の行の完了だけが外れるのを避ける）。見つからなかった（取り消し済み）ときは次へ進む
        const labelOf = (u: string | null) =>
          u ? `${item.unitCode ?? '台'} の完了連絡` : item.unit ? '点検全体（台なし）の完了連絡' : '完了連絡';
        const removed: string[] = [];
        const failed: { label: string; reason: string; stillThere: boolean }[] = [];
        for (const u of unitIds) {
          try {
            if (await unmarkCompleted(id, month, u)) removed.push(labelOf(u));
            else
              failed.push({
                label: labelOf(u),
                reason: '見つかりませんでした（ほかの操作で取り消された可能性があります）',
                stillThere: false,
              });
          } catch (err) {
            console.error('Completion undo failed:', err);
            failed.push({ label: labelOf(u), reason: entryErrorReason(err), stillThere: true });
            if (u !== null) break;
          }
        }
        if (failed.length === 0) {
          addToast('完了連絡を取り消しました', 'success');
        } else if (removed.length === 0 && failed.length === 1) {
          addToast(`取り消しに失敗しました: ${failed[0]!.reason}`, 'error');
        } else {
          const notDone = failed.map((f) => `${f.label}は取り消せませんでした: ${f.reason}`).join('。');
          const still = failed.some((f) => f.stillThere) ? '（この行は「点検完了」のままです）' : '';
          addToast(removed.length > 0 ? `${removed.join('と')}は取り消しました。${notDone}${still}` : `${notDone}${still}`, 'error');
        }
        // 一部だけ取り消せたときも読み直す（消えた分を画面に出す）
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

  // 申請済み（承認前）の申請の修正を始める（修正依頼1026 I11）。申請の行全体を読み、行を入力できる状態にする
  const [openingEditKey, setOpeningEditKey] = useState<string | null>(null);
  const startEdit = useCallback(
    async (item: ScheduleItem, entry: PortalEntryRow) => {
      setOpeningEditKey(item.key);
      try {
        const row = await fetchSubmittedEntryForEdit(entry.id);
        setEditing((prev) => new Map(prev).set(item.key, row));
      } catch (err) {
        console.error('Failed to open entry for edit:', err);
        addToast(`申請を修正できません: ${entryErrorReason(err)}`, 'error');
      } finally {
        setOpeningEditKey(null);
      }
    },
    [addToast],
  );
  const stopEdit = useCallback(
    async (key: string) => {
      if (!(await confirm('修正をやめますか？（入力した内容は消え、申請は今のまま残ります）'))) return;
      setEditing((prev) => {
        const next = new Map(prev);
        next.delete(key);
        return next;
      });
    },
    [confirm],
  );

  const actionsOf = useCallback(
    (item: ScheduleItem): ReactNode => {
      const month = completionMonth(item);
      const key = rowCompletionKey(item);
      const hasCompletion = isRowCompleted(item, completed);
      // 取り消すのはこの行を完了にしている完了連絡すべて（この行の台の完了連絡と、台ごとに分ける前の台なしの完了連絡＝点検の全体）
      const undoUnits = rowUndoCompletionUnitIds(item, completed);
      const accepted = item.report?.status === 'accepted';
      const sentBack = item.application === 'sent_back' ? focusEntry(item.entries) : null;
      const busy = !!key && completingKey === key;
      // 点検月以外の月の行は、その月の申請があるときだけ完了連絡できる（D5。毎月・申請不要の点検種別は月を問わない）
      const blocked = completionBlockedReason(item);
      // 申請済み（承認前）の申請は、申請者・同じ保守会社・管理者が直せる（修正依頼1026 I11）
      const draft = item.application === 'applied' ? focusEntry(item.entries) : null;
      // 申請不要（報告書のみ）の行は日付の欄を出さないので直せない（申請は台なしの申請か、印が付く前のもの）。
      // 台なしの申請（1件入力・旧来）は全部の台の行に出るので、直すのは1台目の行だけ（同じ申請を2つの行で同時に直させない）
      const canEdit =
        !!draft &&
        draft.status === 'draft' &&
        !item.reportOnly &&
        !(item.secondary && !draft.property_unit_id) &&
        (isAdmin || draft.is_mine || (!!draft.vendor_id && draft.vendor_id === profileVendorId));
      const isEditing = !!editOf(item);
      return (
        <div className="flex flex-wrap gap-1">
          {/* 報告書は点検行 × 対象月の単位なので、報告書UP は1台目の行だけ（修正依頼1026 I7） */}
          {!item.secondary && (
            <button
              type="button"
              className={cn(smallBtn, 'border-gray-300 bg-white text-gray-700 hover:bg-gray-100')}
              onClick={() => openReport(item)}
              title="この点検の報告書（PDF）を1件ずつ登録する"
            >
              {item.report?.status === 'returned' ? '報告書を再提出' : '報告書UP'}
            </button>
          )}
          {hasCompletion ? (
            <button
              type="button"
              className={cn(smallBtn, 'border-gray-300 bg-white text-gray-500 hover:bg-gray-100')}
              disabled={busy}
              onClick={() => void toggleCompletion(item, month!, true, undoUnits)}
              title="完了連絡を取り消す"
            >
              完了取消
            </button>
          ) : (
            !accepted && (
              <button
                type="button"
                className={cn(smallBtn, 'border-green-400 bg-green-50 text-green-800 hover:bg-green-100')}
                disabled={busy || !month || !!blocked}
                onClick={() => month && !blocked && void toggleCompletion(item, month, false, [item.unit?.unit_id ?? null])}
                title={
                  blocked ??
                  (month ? '点検の完了を連絡する（報告書が無くても点検完了になります）' : '申請してから完了を連絡できます（対象月が決まらないため）')
                }
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
          {isEditing ? (
            <button
              type="button"
              className={cn(smallBtn, 'border-gray-300 bg-white text-gray-600 hover:bg-gray-100')}
              onClick={() => void stopEdit(item.key)}
              title="修正をやめる（申請は今のまま）"
            >
              修正をやめる
            </button>
          ) : (
            canEdit && (
              <button
                type="button"
                className={cn(smallBtn, 'border-blue-400 bg-blue-50 text-blue-800 hover:bg-blue-100')}
                disabled={openingEditKey === item.key}
                onClick={() => void startEdit(item, draft!)}
                title="承認前の申請を直す（点検日・備考・メモ・案内文・貼紙）。直したら『申請する』で保存します"
              >
                修正
              </button>
            )
          )}
        </div>
      );
    },
    [
      completed,
      completingKey,
      openReport,
      toggleCompletion,
      isAdmin,
      profileVendorId,
      editOf,
      stopEdit,
      startEdit,
      openingEditKey,
    ],
  );

  const infoOf = useCallback(
    (row: BulkEntryRow): BulkRowInfo => {
      if (row.schedule) {
        const item = itemsByKey.get(row.schedule.key);
        if (item) {
          const status = itemStatus(item, completed, today);
          const sentBack = item.application === 'sent_back' ? focusEntry(item.entries)?.review_comment : null;
          const reason = status === 'report_returned' ? item.report?.review_comment : status === 'sent_back' ? sentBack : null;
          const fullName = item.inspection.management_company_name ?? '';
          // 点検月は点検行の値（台ごとの行も同じ。行は点検行の点検月から作るので、台の点検月を出すと行の月と食い違う）。
          // 検査月は台の値（未登録なら点検行の値）。毎月の点検種別と 1〜12 月がそろう点検は「毎月」、それ以外は奇数月・偶数月の2段（H4・修正依頼1027）
          return {
            status,
            reason: reason ?? null,
            managementName: managementLabel(item.inspection.management_company_id, fullName),
            managementFullName: fullName,
            vendorName: item.inspection.vendor_name ?? '',
            months: formatInspectionMonths(item.inspection.inspection_months, item.monthly),
            inspectedOn: formatInspectedOn(item.unit?.inspected_on ?? inspectedOnById.get(item.inspection.inspection_id)),
            actions: actionsOf(item),
          };
        }
      }
      // 未承認の建物は申請で選んだ管理会社（managementOf）
      const m = managementOf(row);
      const linked = row.propertyCode ? inspectionOfManual(row) : undefined;
      const fullName = m ? (managementNames.get(m) ?? '') : '';
      return {
        managementName: managementLabel(m, fullName),
        managementFullName: fullName,
        vendorName: currentVendor.name ?? '',
        months: linked ? formatInspectionMonths(linked.inspection_months, flags.get(linked.inspection_type_id)?.monthly) : '',
        inspectedOn: formatInspectedOn(linked ? inspectedOnById.get(linked.inspection_id) : null),
      };
    },
    [
      itemsByKey,
      completed,
      today,
      inspectedOnById,
      actionsOf,
      managementOf,
      inspectionOfManual,
      managementNames,
      managementLabel,
      flags,
      currentVendor.name,
    ],
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

  // 「＋行を追加」: 新しい行は表の一番上（F1）。表を上へ戻して物件欄へ移る
  const handleAddRow = useCallback(() => {
    addRowWithCopy();
    setTimeout(() => {
      tableRef.current?.scrollTo?.({ top: 0 });
      const first = tableRef.current?.querySelector('tbody tr[data-row-id]');
      first?.querySelector<HTMLElement>('[data-col]')?.focus();
    }, 0);
  }, [addRowWithCopy]);

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
    const idSet = new Set(ids);
    const images = rowPosterImages(useBulkStore.getState().rows.filter((r) => idSet.has(r.id)));
    removeRows(ids);
    discardUnheldRowImages(images);
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
    // 置き換えで消える手の行の画像は、適用したテンプレートが同じ画像を持っていなければ片付ける
    const images = rowPosterImages(useBulkStore.getState().rows.filter((r) => !r.schedule));
    replaceRows(templateRows(template));
    discardUnheldRowImages(images);
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
      showSaveError('申請するデータがありません（予定の行は点検開始日を入れると申請の対象になります）');
      return;
    }
    if (saveBlockedReason) {
      showSaveError(saveBlockedReason);
      return;
    }
    const errorRows = targets.filter((r) => !r.isValid);
    if (errorRows.length > 0) {
      const first = firstError(errorRows)!;
      // 表の No と同じ（表示中の行を表の並び〔手で足した行 → 予定の行・並べ替え〕にした通し番号）
      const rowNo = orderRows(all, isVisible, infoOf, sort).findIndex((r) => r.id === first.rowId) + 1;
      showSaveError(
        `入力にエラーがある行が${errorRows.length}件あります。直してから申請してください\n${rowNo}行目: ${errorLabel(first.message)}`,
        first.rowId,
      );
      focusErrorCell(first.rowId, first.col);
      return;
    }
    const hidden = all.filter((r) => isApplyTarget(r) && !isVisible(r)).length;
    setSaving(true);
    try {
      // 修正中の行（申請済み・承認前。修正依頼1026 I11）は新しい申請を作らず、その申請を直す。直しは何度流しても同じなので先に送る
      // （新しい申請の INSERT が失敗しても、もう一度『申請する』で直しが重ねて効くだけ）
      const edits = targets.filter((r) => r.schedule?.editEntryId);
      const news = targets.filter((r) => !r.schedule?.editEntryId);
      for (const row of edits) {
        const [built] = buildBulkEntries([row], masterData, vendor, appSettings, vendorInspections);
        if (built) await updateSubmittedEntry(row.schedule!.editEntryId!, submittedEntryPatch({ ...built }));
      }
      if (news.length > 0) {
        await createBulkEntries(buildBulkEntries(news, masterData, vendor, appSettings, vendorInspections), userId ?? '');
      }
      if (edits.length > 0) {
        const keys = new Set(edits.map((r) => r.schedule!.key));
        setEditing((prev) => new Map([...prev].filter(([k]) => !keys.has(k))));
      }
      cancelBulkAutoSave();
      clearAutoSave(userId);
      // 申請した手の行だけ消す（申請中に足した行・絞り込みで隠れていた行は残り、removeRows が残りの行で自動保存を書き直す）。
      // 予定の行は入力を空に戻す（読み直しで申請済みの行になる。点検月未登録の行は未申請のまま残るので二重に申請させない）
      const manualIds = targets.filter((r) => !r.schedule).map((r) => r.id);
      const scheduleIds = targets.filter((r) => r.schedule).map((r) => r.id);
      dismissSaveErrors();
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
      showSaveError(saveErrorMessage(error));
    } finally {
      setSaving(false);
    }
  };

  // CSV の対象（未承認の建物の行は物件コードが仮なので出さない。建物の承認後に正式な物件コードで出る）
  const csvTargets = () => applyTargets().filter((r) => !isProvisionalCode(r.propertyCode));

  // v1: js/bulk-data.js downloadCSV
  const handleDownloadCsv = () => {
    const { masterData, currentVendor: vendor, appSettings } = useBulkStore.getState();
    const csv = generateBulkCsv(csvTargets(), masterData, vendor, appSettings);
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
    const csv = generateBulkCsv(csvTargets(), masterData, vendor, appSettings);
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
        handleAddRow();
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
  }, [ready, handleAddRow, handleDuplicate, handleDeleteSelected]);

  const filters = (
    <>
      <select
        aria-label="表示する月"
        value={allMonths ? 'all' : 'inspection'}
        onChange={(e) => setAllMonths(e.target.value === 'all')}
        className="h-7 rounded border border-gray-300 bg-white px-1.5 text-xs"
        title="点検月のみ: 点検月の予定だけ出す（既定）／全ての月: 点検月以外の月にも予定の行を出し、点検月以外の訪問も申請できる"
      >
        <option value="inspection">点検月のみ</option>
        <option value="all">全ての月</option>
      </select>
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
      <label
        className="inline-flex h-7 items-center gap-1 whitespace-nowrap rounded border border-gray-300 bg-white px-1.5 text-xs text-gray-700"
        title="点検開始日が「申請不要」の行（報告書UP・完了連絡だけの点検）も出す"
      >
        <input
          type="checkbox"
          checked={showReportOnly}
          onChange={(e) => toggleShowReportOnly(e.target.checked)}
          className="h-3.5 w-3.5 rounded border-gray-300"
        />
        申請不要も表示
      </label>
      {hiddenReportOnlyCount > 0 && (
        <span className="whitespace-nowrap text-[11px] text-gray-500" data-testid="hidden-report-only">
          申請不要 {hiddenReportOnlyCount}件を非表示
        </span>
      )}
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
          onAddRow={handleAddRow}
          onDuplicate={handleDuplicate}
          onDeleteSelected={() => void handleDeleteSelected()}
          onOpenBulkApply={() => setShowBulkApply(true)}
          onOpenPaste={() => setShowPaste(true)}
          onOpenBulkReport={() => setShowBulkReport(true)}
          onOpenOtherFile={() => setShowOtherFile(true)}
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
          ref={tableRef}
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
              <Button onClick={handleAddRow} disabled={!ready}>
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
              sort={sort}
              onSortChange={setSort}
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
        defaultPerformedOn={reportTarget?.defaultPerformedOn ?? null}
        onUploaded={() => {
          setReportTarget(null);
          void portal.refetch();
        }}
        onDeleted={() => void portal.refetch()}
      />
      <BulkReportUploadModal
        open={showBulkReport}
        onClose={() => setShowBulkReport(false)}
        vendorId={currentVendor.id}
        onUploaded={() => void portal.refetch()}
      />
      {/* 建物の選択肢は、モーダルが DB の「置ける建物」を読む（修正依頼1025 G2） */}
      <OtherFileUploadModal open={showOtherFile} onClose={() => setShowOtherFile(false)} />
      <BuildingRequestModal
        open={showBuildingRequest}
        onClose={() => setShowBuildingRequest(false)}
        vendorId={currentVendor.id}
        managementCompanyId={
          managementCompanyId && managementCompanyId !== MANAGEMENT_COMPANY_NONE ? managementCompanyId : null
        }
        onSubmitted={handleBuildingRequested}
      />
      {confirmDialog}
    </div>
  );
}
