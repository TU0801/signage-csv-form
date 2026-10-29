import { useCallback, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import type { DbInspectionReport, DbPropertyFile } from '@/types/portal';
import { Button } from '@/components/ui/Button';
import { cn } from '@/lib/utils';
import { Spinner } from '@/components/ui/Spinner';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { useToast } from '@/components/ui/Toast';
import { useAuth } from '@/hooks/useAuth';
import { downloadCsv } from '@/lib/csv';
import { entryErrorReason } from '@/lib/api/admin-entries';
import { downloadReportBlob, reportSignedUrl, reviewInspectionReport, updateInspectionReport } from '@/lib/api/portal';
import { deletePropertyFile, propertyFileSignedUrl } from '@/lib/api/property-files';
import { todayJst } from '@/features/inspection-portal/lib/schedule';
import { useInspectionDocuments } from '../hooks/useInspectionDocuments';
import {
  DEFAULT_REPORT_FILTERS,
  buildReportTree,
  filterReports,
  matchesTreeSelection,
  reportPermissions,
  reportsToCsv,
  revealReport,
  type ReportFilters,
  type TreeSelection,
} from '../lib/documents';
import { downloadReportsZip } from '../lib/zip';
import { showPdfInTab, withPdfTitle } from '../lib/pdfTab';
import { ReportTree } from './ReportTree';
import { ReportFiltersBar } from './ReportFiltersBar';
import { ReportsTable } from './ReportsTable';
import { ReportReturnModal } from './ReportReturnModal';
import { FileUploadModal, type FileUploadPreset } from './FileUploadModal';
import { PropertyFilesTable, type PropertyFileAction } from './PropertyFilesTable';
import type { ReportAction } from './ReportRowActions';
import {
  canDeletePropertyFile,
  filterPropertyFiles,
  propertyCandidatesOf,
  propertyFileInSelection,
  propertyFileTreeRow,
} from '../lib/propertyFiles';

/**
 * 点検報告書の整理（DocFlow 相当・OCR なし）。左に建物 → 年 → 点検種別の仮想ツリー、右に表。
 * 見える範囲は RLS（保守会社は担当の点検、管理会社は自社物件、管理者は全件）、操作の可否は RPC が最終判断する。
 * ?report=<id> で開くと（点検一覧の報告書のリンク）、その1件だけに絞って行を強調する
 */
export function InspectionDocuments() {
  const { addToast } = useToast();
  const { isAdmin, isManagement, vendorId, managementCompanyId, user } = useAuth();
  const { reports, inspections, files, loading, error, inspectionsError, filesError, reload, replaceReport, replaceFile } =
    useInspectionDocuments();

  const [filters, setFilters] = useState<ReportFilters>(DEFAULT_REPORT_FILTERS);
  const [treeSelection, setTreeSelection] = useState<TreeSelection | null>(null);

  const [searchParams, setSearchParams] = useSearchParams();
  const focusId = searchParams.get('report');
  const focusReport = useMemo(
    () => (focusId ? (reports.find((r) => r.id === focusId) ?? null) : null),
    [reports, focusId],
  );
  // 指された版が絞り込みやツリーで隠れないよう、見つかったときに一度だけ条件を合わせる（以後は利用者が自由に変えられる）
  const [revealedId, setRevealedId] = useState<string | null>(null);
  if (focusReport && revealedId !== focusReport.id) {
    setRevealedId(focusReport.id);
    const revealed = revealReport(focusReport, filters);
    setFilters(revealed.filters);
    setTreeSelection(revealed.selection);
  }
  const clearFocus = useCallback(() => {
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        next.delete('report');
        return next;
      },
      { replace: true },
    );
  }, [setSearchParams]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [keepHierarchy, setKeepHierarchy] = useState(true);
  const [zipProgress, setZipProgress] = useState<{ done: number; total: number } | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [returning, setReturning] = useState<DbInspectionReport | null>(null);
  const [deleting, setDeleting] = useState<DbInspectionReport | null>(null);
  /** ファイルアップロードの画面（報告書一括アップロード・その他ファイル・再提出・編集を1つの画面で開く。修正依頼1029 決定①） */
  const [upload, setUpload] = useState<FileUploadPreset | null>(null);
  const [deletingFile, setDeletingFile] = useState<DbPropertyFile | null>(null);
  // 一括アップロードは提出できるロール（保守会社・管理者）だけ。管理者は保守会社を選ばず全社の点検から選ぶ
  const canBulkUpload = isAdmin || !isManagement;

  const viewer = useMemo(() => ({ isAdmin, isManagement, vendorId }), [isAdmin, isManagement, vendorId]);
  const filtered = useMemo(() => filterReports(reports, filters), [reports, filters]);
  // その他ファイル（見積書など）は、ツリーの点検種別の段に区分名で並べる（修正依頼1025 G2）
  const filteredFiles = useMemo(() => filterPropertyFiles(files, filters), [files, filters]);
  const tree = useMemo(
    () => buildReportTree([...filtered, ...filteredFiles.map(propertyFileTreeRow)]),
    [filtered, filteredFiles],
  );
  // 点検一覧のリンクで1件の報告書を指しているときは、その他ファイルは出さない
  const visibleFiles = useMemo(
    () => (focusId ? [] : filteredFiles.filter((f) => propertyFileInSelection(f, treeSelection))),
    [filteredFiles, treeSelection, focusId],
  );
  const propertyCandidates = useMemo(() => propertyCandidatesOf(inspections), [inspections]);
  const visible = useMemo(
    () => filtered.filter((r) => matchesTreeSelection(r, treeSelection) && (!focusId || r.id === focusId)),
    [filtered, treeSelection, focusId],
  );
  // 読み込みが終わっても見つからない（範囲外・既に無い）ときは、黙って0件にせず理由を出す
  const focusMissing = !!focusId && !focusReport && !loading && !error;
  const selectedVisible = useMemo(() => visible.filter((r) => selected.has(r.id)), [visible, selected]);
  const inspectionsById = useMemo(() => new Map(inspections.map((i) => [i.inspection_id, i])), [inspections]);
  const vendorOptions = useMemo(() => {
    if (!isAdmin && !isManagement) return null;
    const m = new Map<string, string>();
    for (const r of reports) if (r.vendor_id) m.set(r.vendor_id, r.vendor_name ?? r.vendor_id);
    return [...m.entries()]
      .map(([value, label]) => ({ value, label }))
      .sort((a, b) => a.label.localeCompare(b.label, 'ja'));
  }, [reports, isAdmin, isManagement]);

  const permissionsOf = useCallback((r: DbInspectionReport) => reportPermissions(r, viewer), [viewer]);

  const failToast = (what: string, err: unknown) => addToast(`${what}に失敗しました: ${entryErrorReason(err)}`, 'error');

  const runUpdate = async (report: DbInspectionReport, what: string, call: () => Promise<DbInspectionReport>) => {
    setBusyId(report.id);
    try {
      replaceReport(await call());
      addToast(`${what}しました`, 'success');
    } catch (err) {
      failToast(what, err);
    } finally {
      setBusyId(null);
    }
  };

  const handleAction = async (report: DbInspectionReport, action: ReportAction) => {
    switch (action) {
      case 'open': {
        // 取り出しを待つ間にポップアップブロックされないよう、先に空のタブを開いておく
        const tab = window.open('', '_blank');
        try {
          if (tab) {
            // 開いた先からこの画面を操作させない（noopener を付けると空タブの参照が取れないので後から切る）
            tab.opener = null;
            tab.document.title = report.file_name;
            // タブの名前を報告書のファイル名にする（署名付き URL を直接開くとランダムな英数字の名前になる。修正依頼1027(2)）
            showPdfInTab(tab, await withPdfTitle(await downloadReportBlob(report), report.file_name), report.file_name);
          } else window.open(await reportSignedUrl(report), '_blank', 'noopener');
        } catch (err) {
          tab?.close();
          failToast('報告書を開くの', err);
        }
        return;
      }
      case 'download': {
        try {
          const url = await reportSignedUrl(report, { download: true });
          const a = document.createElement('a');
          a.href = url;
          a.download = report.file_name;
          a.click();
        } catch (err) {
          failToast('ダウンロード', err);
        }
        return;
      }
      case 'edit':
        // 点検が分かれば、同じ点検・対象月の報告書も並べる（点検行が消された版はその1件だけ）
        setUpload({
          kind: 'edit',
          report,
          inspection: report.property_inspection_id ? (inspectionsById.get(report.property_inspection_id) ?? null) : null,
        });
        return;
      case 'delete':
        setDeleting(report);
        return;
      case 'restore':
        await runUpdate(report, '復元', () => updateInspectionReport(report.id, 'restore'));
        return;
      case 'accept':
        await runUpdate(report, '受領', () => reviewInspectionReport(report.id, 'accept'));
        return;
      case 'return':
        setReturning(report);
        return;
      case 'resubmit': {
        // 点検行が業務システムで消された版は出し直す点検を選べない（ボタンも出さないが、念のため止める）
        if (report.property_inspection_id === null) {
          addToast('この報告書の点検は削除されているため、再提出できません', 'error');
          return;
        }
        const inspection = inspectionsById.get(report.property_inspection_id);
        if (!inspection) {
          addToast('この報告書の点検が見つかりません（担当から外れた可能性があります）', 'error');
          return;
        }
        setUpload({
          kind: 'report',
          inspection,
          targetMonth: report.target_month,
          entryId: report.entry_id,
          previous: report,
        });
        return;
      }
    }
  };

  const handleFileAction = async (file: DbPropertyFile, action: PropertyFileAction) => {
    if (action === 'delete') {
      setDeletingFile(file);
      return;
    }
    if (action === 'open') {
      const tab = window.open('', '_blank');
      try {
        const url = await propertyFileSignedUrl(file);
        if (tab) {
          tab.opener = null;
          tab.location.href = url;
        } else window.open(url, '_blank', 'noopener');
      } catch (err) {
        tab?.close();
        failToast('ファイルを開くの', err);
      }
      return;
    }
    try {
      const url = await propertyFileSignedUrl(file, { download: true });
      const a = document.createElement('a');
      a.href = url;
      a.download = file.file_name;
      a.click();
    } catch (err) {
      failToast('ダウンロード', err);
    }
  };

  const handleReturn = async (report: DbInspectionReport, comment: string) => {
    try {
      replaceReport(await reviewInspectionReport(report.id, 'return', comment));
      addToast('差し戻しました', 'success');
    } catch (err) {
      failToast('差戻し', err);
      throw err;
    }
  };

  const handleZip = async () => {
    if (selectedVisible.length === 0) {
      addToast('ZIP にする報告書を選んでください', 'error');
      return;
    }
    setZipProgress({ done: 0, total: selectedVisible.length });
    try {
      const { added, failed } = await downloadReportsZip(selectedVisible, {
        keepHierarchy,
        zipName: `点検報告書_${todayJst().replace(/-/g, '')}.zip`,
        onProgress: (done, total) => setZipProgress({ done, total }),
      });
      if (failed.length > 0) {
        addToast(
          `${failed.length}件を取り出せませんでした（保管庫へ移動済み・通信の失敗など）:\n${failed.slice(0, 5).join('\n')}${failed.length > 5 ? '\n…' : ''}`,
          'warning',
        );
      }
      if (added > 0) addToast(`${added}件を ZIP にしました`, 'success');
    } catch (err) {
      failToast('ZIP の作成', err);
    } finally {
      setZipProgress(null);
    }
  };

  const handleCsv = () => {
    if (visible.length === 0) {
      addToast('書き出す報告書がありません', 'error');
      return;
    }
    downloadCsv(reportsToCsv(visible), `点検報告書一覧_${todayJst().replace(/-/g, '')}.csv`);
  };

  return (
    <div className="flex h-[calc(100dvh-var(--header-h))] min-h-96 flex-col gap-1.5 p-2">
      <div className="flex flex-wrap items-baseline gap-x-3">
        <h1 className="text-base font-bold text-gray-900">点検報告書</h1>
        <p className="text-xs text-gray-500">
          建物・年・点検種別で整理して表示します。左のフォルダを選ぶと表を絞り込めます。
        </p>
        <span className="ml-auto flex gap-1 self-center">
          {/* その他ファイルは管理会社もアップロードできる（建物関連情報など） */}
          <Button
            variant="secondary"
            size="sm"
            className="text-xs"
            onClick={() => setUpload({ kind: 'other', propertyCode: treeSelection?.propertyCode ?? null })}
          >
            その他ファイルアップロード
          </Button>
          {canBulkUpload && (
            <Button size="sm" className="text-xs" onClick={() => setUpload({ kind: 'bulk' })}>
              報告書一括アップロード
            </Button>
          )}
        </span>
      </div>
      <ReportFiltersBar
        filters={filters}
        onChange={setFilters}
        onClear={() => {
          clearFocus();
          setTreeSelection(null);
        }}
        vendorOptions={vendorOptions}
      />
      {focusId && (
        <div
          role="status"
          className={cn(
            'flex flex-wrap items-center gap-2 rounded px-2 py-1 text-xs',
            focusMissing ? 'bg-red-50 text-red-800' : 'bg-amber-50 text-amber-900',
          )}
        >
          <span>
            {focusMissing
              ? '指定された報告書は見つかりません（見る権限が無いか、すでに無い報告書です）。'
              : focusReport
                ? `点検一覧から指定された報告書（${focusReport.file_name}）だけを表示しています。`
                : error != null
                  ? '指定された報告書を表示できません（読み込みに失敗しました）。'
                  : '指定された報告書を読み込んでいます…'}
          </span>
          <Button variant="secondary" size="sm" className="text-xs" onClick={clearFocus}>
            すべての報告書を表示
          </Button>
        </div>
      )}
      {error != null && reports.length > 0 && (
        <p role="alert" className="text-xs text-red-700">
          報告書を読み直せませんでした（{entryErrorReason(error)}）。表は前回読み込んだ内容です。
        </p>
      )}
      {inspectionsError != null && error == null && (
        <p className="text-xs text-amber-800">
          点検の一覧を読み込めなかったため、いまは再提出できません（{entryErrorReason(inspectionsError)}）。
        </p>
      )}

      <div className="flex flex-wrap items-center gap-2 text-xs">
        <span className="text-gray-600">
          {visible.length}件表示{selectedVisible.length > 0 && `・${selectedVisible.length}件選択`}
        </span>
        <Button size="sm" className="text-xs" onClick={() => void handleZip()} disabled={!!zipProgress || selectedVisible.length === 0}>
          選択を ZIP
        </Button>
        <label className="flex items-center gap-1 text-gray-600">
          <input type="checkbox" checked={keepHierarchy} onChange={(e) => setKeepHierarchy(e.target.checked)} />
          フォルダ階層（建物/年/点検種別）を保つ
        </label>
        {zipProgress && (
          <span className="flex items-center gap-1 text-gray-600" role="status">
            <Spinner size="sm" />
            {zipProgress.done}/{zipProgress.total}件 取り出し中…
          </span>
        )}
        <Button variant="secondary" size="sm" className="text-xs" onClick={handleCsv}>
          一覧を CSV
        </Button>
        <Button variant="ghost" size="sm" className="text-xs" onClick={() => void reload()} disabled={loading}>
          再読み込み
        </Button>
      </div>

      <div className="flex min-h-0 flex-1 gap-2">
        <aside className="w-48 shrink-0 overflow-y-auto 2xl:w-56 rounded border border-gray-200 bg-white p-1">
          <ReportTree
            tree={tree}
            total={filtered.length + filteredFiles.length}
            selection={treeSelection}
            onSelect={(sel) => {
              // フォルダを選び直したら、指定の1件への絞り込みは外す
              clearFocus();
              setTreeSelection(sel);
            }}
          />
        </aside>
        <div className="min-w-0 flex-1 overflow-auto rounded border border-gray-200 bg-white">
          {loading && reports.length === 0 ? (
            <div className="flex justify-center p-6">
              <Spinner />
            </div>
          ) : error != null && reports.length === 0 ? (
            // 読み込みの失敗を「該当なし」と見分けられるよう、表の場所に理由と再読み込みを出す
            <div role="alert" className="flex flex-col items-center gap-2 p-6 text-xs text-red-700">
              <p>報告書を読み込めませんでした（{entryErrorReason(error)}）。</p>
              <Button variant="secondary" size="sm" className="text-xs" onClick={() => void reload()}>
                再読み込み
              </Button>
            </div>
          ) : (
            <ReportsTable
              reports={visible}
              selected={selected}
              onToggle={(id) =>
                setSelected((prev) => {
                  const next = new Set(prev);
                  if (next.has(id)) next.delete(id);
                  else next.add(id);
                  return next;
                })
              }
              onToggleAll={(checked) =>
                setSelected((prev) => {
                  const next = new Set(prev);
                  for (const r of visible) {
                    if (checked) next.add(r.id);
                    else next.delete(r.id);
                  }
                  return next;
                })
              }
              permissionsOf={permissionsOf}
              highlightId={focusReport?.id ?? null}
              busyId={busyId}
              onAction={(r, a) => void handleAction(r, a)}
            />
          )}
          {(visibleFiles.length > 0 || filesError != null) && (
            <section className="mt-2 border-t border-gray-200" aria-label="その他ファイルの一覧">
              <h2 className="px-1.5 py-1 text-xs font-bold text-gray-700">
                その他ファイル（{visibleFiles.length}件）
                {filesError != null && (
                  <span className="ml-2 font-normal text-red-700">読み込めませんでした（{entryErrorReason(filesError)}）</span>
                )}
              </h2>
              {visibleFiles.length > 0 && (
                <PropertyFilesTable
                  files={visibleFiles}
                  canDelete={(f) =>
                    canDeletePropertyFile(f, { isAdmin, userId: user?.id, vendorId: isManagement ? null : vendorId, managementCompanyId })
                  }
                  busyId={busyId}
                  onAction={(f, a) => void handleFileAction(f, a)}
                />
              )}
            </section>
          )}
        </div>
      </div>

      <ReportReturnModal report={returning} onClose={() => setReturning(null)} onSubmit={handleReturn} />
      <ConfirmDialog
        open={!!deleting}
        onClose={() => setDeleting(null)}
        onConfirm={() => {
          const target = deleting;
          if (target) void runUpdate(target, '削除', () => updateInspectionReport(target.id, 'delete'));
        }}
        title="報告書の削除"
        message={`「${deleting?.file_name ?? ''}」を削除しますか？\n「削除済みも表示」から復元できます。`}
        confirmLabel="削除"
        variant="danger"
      />
      <ConfirmDialog
        open={!!deletingFile}
        onClose={() => setDeletingFile(null)}
        onConfirm={() => {
          const target = deletingFile;
          if (!target) return;
          setBusyId(target.id);
          void deletePropertyFile(target.id)
            .then((updated) => {
              replaceFile(updated);
              addToast('削除しました', 'success');
            })
            .catch((err: unknown) => failToast('削除', err))
            .finally(() => setBusyId(null));
        }}
        title="ファイルの削除"
        message={`「${deletingFile?.file_name ?? ''}」を削除しますか？\n削除したファイルは「削除済みも表示」で一覧に残ります（元に戻すときは管理者に連絡）。`}
        confirmLabel="削除"
        variant="danger"
      />
      <FileUploadModal
        open={!!upload}
        preset={upload}
        onClose={() => setUpload(null)}
        // 管理者は保守会社を選ばず全社の点検から選ぶ
        vendorId={isAdmin || isManagement ? null : (vendorId ?? null)}
        properties={propertyCandidates}
        // 報告書は1件増える・編集で名前が変わるので、1行の差し替えでなく読み直す
        onChanged={() => void reload()}
      />
    </div>
  );
}
