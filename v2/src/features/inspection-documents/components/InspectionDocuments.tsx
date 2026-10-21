import { useCallback, useMemo, useState } from 'react';
import type { DbInspectionReport, PortalInspectionRow } from '@/types/portal';
import { Button } from '@/components/ui/Button';
import { Spinner } from '@/components/ui/Spinner';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { useToast } from '@/components/ui/Toast';
import { useAuth } from '@/hooks/useAuth';
import { downloadCsv } from '@/lib/csv';
import { entryErrorReason } from '@/lib/api/admin-entries';
import { reportSignedUrl, reviewInspectionReport, updateInspectionReport } from '@/lib/api/portal';
import { todayJst } from '@/features/inspection-portal/lib/schedule';
import { useInspectionDocuments } from '../hooks/useInspectionDocuments';
import {
  DEFAULT_REPORT_FILTERS,
  buildReportTree,
  filterReports,
  matchesTreeSelection,
  reportPermissions,
  reportsToCsv,
  type ReportFilters,
  type TreeSelection,
} from '../lib/documents';
import { downloadReportsZip } from '../lib/zip';
import { ReportTree } from './ReportTree';
import { ReportFiltersBar } from './ReportFiltersBar';
import { ReportsTable } from './ReportsTable';
import { ReportEditModal } from './ReportEditModal';
import { ReportReturnModal } from './ReportReturnModal';
import { ReportUploadModal } from './ReportUploadModal';
import type { ReportAction } from './ReportRowActions';

/**
 * 点検報告書の整理（DocFlow 相当・OCR なし）。左に建物 → 年 → 点検種別の仮想ツリー、右に表。
 * 見える範囲は RLS（保守会社は担当の点検、管理会社は自社物件、管理者は全件）、操作の可否は RPC が最終判断する
 */
export function InspectionDocuments() {
  const { addToast } = useToast();
  const { isAdmin, isManagement, vendorId } = useAuth();
  const onLoadError = useCallback(
    (err: unknown) => addToast(`報告書の読み込みに失敗しました: ${entryErrorReason(err)}`, 'error'),
    [addToast],
  );
  const { reports, inspections, loading, reload, replaceReport } = useInspectionDocuments(onLoadError);

  const [filters, setFilters] = useState<ReportFilters>(DEFAULT_REPORT_FILTERS);
  const [treeSelection, setTreeSelection] = useState<TreeSelection | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [keepHierarchy, setKeepHierarchy] = useState(true);
  const [zipProgress, setZipProgress] = useState<{ done: number; total: number } | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [editing, setEditing] = useState<DbInspectionReport | null>(null);
  const [returning, setReturning] = useState<DbInspectionReport | null>(null);
  const [deleting, setDeleting] = useState<DbInspectionReport | null>(null);
  const [resubmit, setResubmit] = useState<{ report: DbInspectionReport; inspection: PortalInspectionRow } | null>(null);

  const viewer = useMemo(() => ({ isAdmin, isManagement, vendorId }), [isAdmin, isManagement, vendorId]);
  const filtered = useMemo(() => filterReports(reports, filters), [reports, filters]);
  const tree = useMemo(() => buildReportTree(filtered), [filtered]);
  const visible = useMemo(() => filtered.filter((r) => matchesTreeSelection(r, treeSelection)), [filtered, treeSelection]);
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
        // 署名 URL を待つ間にポップアップブロックされないよう、先に空のタブを開いておく
        const tab = window.open('', '_blank');
        try {
          const url = await reportSignedUrl(report);
          if (tab) {
            // 開いた先からこの画面を操作させない（noopener を付けると空タブの参照が取れないので後から切る）
            tab.opener = null;
            tab.location.href = url;
          }
          else window.open(url, '_blank', 'noopener');
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
        setEditing(report);
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
        const inspection = inspectionsById.get(report.property_inspection_id);
        if (!inspection) {
          addToast('この報告書の点検が見つかりません（担当から外れた可能性があります）', 'error');
          return;
        }
        setResubmit({ report, inspection });
        return;
      }
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
      </div>
      <ReportFiltersBar filters={filters} onChange={setFilters} vendorOptions={vendorOptions} />

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
        <aside className="w-56 shrink-0 overflow-y-auto rounded border border-gray-200 bg-white p-1">
          <ReportTree tree={tree} total={filtered.length} selection={treeSelection} onSelect={setTreeSelection} />
        </aside>
        <div className="min-w-0 flex-1 overflow-auto rounded border border-gray-200 bg-white">
          {loading && reports.length === 0 ? (
            <div className="flex justify-center p-6">
              <Spinner />
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
              busyId={busyId}
              onAction={(r, a) => void handleAction(r, a)}
            />
          )}
        </div>
      </div>

      <ReportEditModal report={editing} onClose={() => setEditing(null)} onSaved={replaceReport} />
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
      <ReportUploadModal
        open={!!resubmit}
        onClose={() => setResubmit(null)}
        inspection={resubmit?.inspection ?? null}
        targetMonth={resubmit?.report.target_month ?? null}
        entryId={resubmit?.report.entry_id ?? null}
        previous={resubmit?.report ?? null}
        // 再提出は前の版を置き換え済みにするので、1行の差し替えでなく読み直す
        onUploaded={() => void reload()}
      />
    </div>
  );
}
