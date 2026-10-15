import { useState, useCallback } from 'react';
import { Button } from '@/components/ui/Button';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { CheckIcon, UndoIcon } from '@/components/ui/icons';
import { useToast } from '@/components/ui/Toast';
import {
  generateAdminCsv,
  filterApprovedEntries,
  downloadCsv,
  copyCsvToClipboard,
} from '@/lib/csv';
import type { AdminEntryStatus } from '@/lib/api/admin-entries';
import type { DbEntry } from '@/types/database';
import type { EntriesFilters } from '../hooks/useEntriesFilters';
import { bulkStatusLabel, filterExportEntries } from '../lib/entries';

interface EntryActionsProps {
  /** 一覧に読み込んだ行（承認済みのみ）。CSV・コピー・追加画像DL の対象はここから選ぶ（選択行ではない） */
  entries: DbEntry[];
  /** チェックした行。一括削除・ステータス変更・点検レポートの対象 */
  selectedEntries: DbEntry[];
  filters: EntriesFilters;
  propertyNames: Map<string, string>;
  displayTimeDefault: string | undefined;
  onStatusChange: (ids: string[], status: AdminEntryStatus) => Promise<void>;
  onBulkDelete: (ids: string[]) => Promise<void>;
}

type PendingConfirm = { kind: 'status'; status: AdminEntryStatus } | { kind: 'delete' };

// v1: admin.html #tab-entries .action-bar / js/admin-entries.js / js/admin-export.js
export function EntryActions({
  entries,
  selectedEntries,
  filters,
  propertyNames,
  displayTimeDefault,
  onStatusChange,
  onBulkDelete,
}: EntryActionsProps) {
  const { addToast } = useToast();
  const [downloading, setDownloading] = useState(false);
  const [confirm, setConfirm] = useState<PendingConfirm | null>(null);
  const hasSelection = selectedEntries.length > 0;
  const selectedIds = selectedEntries.map((e) => e.id);

  // v1: js/admin-export.js exportCSV
  const handleExportCsv = useCallback(() => {
    const csv = generateAdminCsv(filterExportEntries(entries, filters), displayTimeDefault);
    if (!csv) {
      addToast('エクスポートするデータがありません', 'error');
      return;
    }
    const timestamp = new Date().toISOString().replace(/[-:]/g, '').slice(0, 15);
    downloadCsv(csv, `admin-export-${timestamp}.csv`);
    addToast('CSVをダウンロードしました', 'success');
  }, [entries, filters, displayTimeDefault, addToast]);

  // v1: js/admin-export.js copyCSV
  const handleCopyCsv = useCallback(async () => {
    const csv = generateAdminCsv(filterExportEntries(entries, filters), displayTimeDefault);
    if (!csv) {
      addToast('コピーするデータがありません', 'error');
      return;
    }
    try {
      await copyCsvToClipboard(csv);
      addToast('CSVをクリップボードにコピーしました', 'success');
    } catch {
      addToast('コピーに失敗しました', 'error');
    }
  }, [entries, filters, displayTimeDefault, addToast]);

  // v1: js/admin-export.js exportInspectionReport
  const handleExportReport = useCallback(async () => {
    if (!hasSelection) {
      addToast('レポート対象を選択してください', 'error');
      return;
    }
    try {
      const { downloadInspectionReport } = await import('../lib/inspectionReport');
      await downloadInspectionReport(selectedEntries, propertyNames);
      addToast('点検レポートをダウンロードしました', 'success');
    } catch (error) {
      console.error('Failed to export report:', error);
      addToast('点検レポートの出力に失敗しました', 'error');
    }
  }, [hasSelection, selectedEntries, propertyNames, addToast]);

  // v1: js/admin-export.js downloadCustomImages（承認済みの追加画像すべて。ZIP 内は customImageBaseName + .jpg）
  const handleDownloadImages = useCallback(async () => {
    const count = filterApprovedEntries(entries).filter(
      (e) => e.poster_type === 'custom' && e.poster_image,
    ).length;
    if (count === 0) {
      addToast('ダウンロード対象の追加画像がありません', 'info');
      return;
    }
    addToast(`${count}件の画像をダウンロード中...`, 'info');
    setDownloading(true);
    try {
      const { downloadCustomImages } = await import('@/lib/zipDownload');
      const done = await downloadCustomImages(entries);
      addToast(`${done}件の画像をダウンロードしました`, 'success');
    } catch (error) {
      console.error('Failed to download images:', error);
      addToast('画像のダウンロードに失敗しました', 'error');
    } finally {
      setDownloading(false);
    }
  }, [entries, addToast]);

  const confirmMessage =
    confirm?.kind === 'delete'
      ? `選択した${selectedIds.length}件のデータを完全に削除してもよろしいですか？ この操作は取り消せません。`
      : confirm?.kind === 'status' && confirm.status === 'pending'
        ? // 未申請（pending）は管理画面のどの一覧にも出ないので、戻した後に見えなくなることを先に伝える
          `選択した${selectedIds.length}件を「未申請」に戻しますか？\n` +
          '申請者の入力画面の一覧に「未申請」として残り、管理画面の承認待ち・承認済みのどちらにも出なくなります。'
        : confirm?.kind === 'status'
          ? `選択した${selectedIds.length}件を「${bulkStatusLabel(confirm.status)}」に変更しますか？`
          : '';

  // 選択した行が対象の操作と、一覧に出ている全件が対象の操作を分けて並べる（CSV は選択に関係なく全件を出す）
  return (
    <div className="flex flex-wrap items-start gap-x-6 gap-y-2">
      <div role="group" aria-label="選択した行への操作" className="space-y-1">
        <p className={hasSelection ? 'text-xs font-medium text-blue-800' : 'text-xs text-gray-500'}>
          選択した行に対して（{selectedEntries.length}件）
          {!hasSelection && ': 行のチェックで選びます'}
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <Button
            size="sm"
            variant="danger"
            disabled={!hasSelection}
            onClick={() => setConfirm({ kind: 'delete' })}
          >
            一括削除
          </Button>
          <Button
            size="sm"
            variant="secondary"
            disabled={!hasSelection}
            onClick={() => setConfirm({ kind: 'status', status: 'exported' })}
          >
            <CheckIcon size={14} className="mr-1" />
            取込済みにする
          </Button>
          <Button
            size="sm"
            variant="secondary"
            disabled={!hasSelection}
            onClick={() => setConfirm({ kind: 'status', status: 'ready' })}
          >
            <UndoIcon size={14} className="mr-1" />
            未取込に戻す
          </Button>
          <Button
            size="sm"
            variant="secondary"
            disabled={!hasSelection}
            onClick={() => setConfirm({ kind: 'status', status: 'pending' })}
          >
            未申請に戻す
          </Button>
          <Button size="sm" variant="success" onClick={handleExportReport}>
            点検レポート
          </Button>
        </div>
      </div>
      <div role="group" aria-label="表示中の全件への操作" className="space-y-1">
        <p className="text-xs text-gray-500">
          表示中の全件に対して（{entries.length}件・選択は関係なし）
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <Button size="sm" variant="success" onClick={handleExportCsv}>
            CSV
          </Button>
          <Button size="sm" variant="secondary" onClick={handleCopyCsv}>
            コピー
          </Button>
          <Button size="sm" variant="secondary" onClick={handleDownloadImages} disabled={downloading}>
            {downloading ? 'DL中...' : '追加画像DL'}
          </Button>
        </div>
      </div>

      <ConfirmDialog
        open={confirm !== null}
        onClose={() => setConfirm(null)}
        onConfirm={() => {
          if (!confirm) return;
          if (confirm.kind === 'delete') void onBulkDelete(selectedIds);
          else void onStatusChange(selectedIds, confirm.status);
        }}
        title={confirm?.kind === 'delete' ? '一括削除' : 'ステータス変更'}
        message={confirmMessage}
        confirmLabel={confirm?.kind === 'delete' ? '削除する' : '変更する'}
        variant={confirm?.kind === 'delete' ? 'danger' : 'primary'}
      />
    </div>
  );
}
