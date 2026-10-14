import { useState, useCallback } from 'react';
import { Button } from '@/components/ui/Button';
import { Select } from '@/components/ui/Select';
import { useToast } from '@/components/ui/Toast';
import { supabase, TABLES } from '@/lib/supabase';
import { EntryStatus } from '@/lib/constants';
import {
  generateAdminCsv,
  filterApprovedEntries,
  downloadCsv,
  copyCsvToClipboard,
} from '@/lib/csv';
import type { DbEntry, DbProperty } from '@/types/database';

interface EntryActionsProps {
  selectedEntries: DbEntry[];
  onStatusChange: (ids: string[], status: EntryStatus) => Promise<void>;
  onClearSelection: () => void;
}

/**
 * 設定 display_time_default（text）。v1 admin-settings.js loadAppSettings と同じく、
 * 読めなければ undefined を返し generateAdminCsv 側の既定 6 秒にする
 */
async function fetchDisplayTimeDefault(): Promise<string | undefined> {
  const { data, error } = await supabase
    .from(TABLES.settings)
    .select('setting_value')
    .eq('setting_key', 'display_time_default')
    .maybeSingle();
  if (error) return undefined;
  return (data as { setting_value: string } | null)?.setting_value ?? undefined;
}

/** 本番CSV（v1 admin-export.js と同じ）。出力は承認済み（ready/exported）だけ */
async function buildAdminCsv(entries: DbEntry[]): Promise<string> {
  return generateAdminCsv(filterApprovedEntries(entries), await fetchDisplayTimeDefault());
}

const statusOptions = [
  { value: EntryStatus.PENDING, label: 'pending' },
  { value: EntryStatus.DRAFT, label: 'draft' },
  { value: EntryStatus.READY, label: 'ready' },
  { value: EntryStatus.EXPORTED, label: 'exported' },
];

export function EntryActions({
  selectedEntries,
  onStatusChange,
  onClearSelection,
}: EntryActionsProps) {
  const { addToast } = useToast();
  const [downloading, setDownloading] = useState(false);

  const handleExportCsv = useCallback(async () => {
    if (selectedEntries.length === 0) {
      addToast('エクスポートするエントリーを選択してください', 'warning');
      return;
    }
    const csv = await buildAdminCsv(selectedEntries);
    if (!csv) {
      addToast('エクスポートするデータがありません（承認済みのみ出力されます）', 'error');
      return;
    }
    // v1 exportCSV と同じファイル名
    const timestamp = new Date().toISOString().replace(/[-:]/g, '').slice(0, 15);
    downloadCsv(csv, `admin-export-${timestamp}.csv`);
    addToast('CSVをダウンロードしました', 'success');
  }, [selectedEntries, addToast]);

  const handleCopyCsv = useCallback(async () => {
    if (selectedEntries.length === 0) {
      addToast('コピーするエントリーを選択してください', 'warning');
      return;
    }
    try {
      const csv = await buildAdminCsv(selectedEntries);
      if (!csv) {
        addToast('コピーするデータがありません（承認済みのみ出力されます）', 'error');
        return;
      }
      await copyCsvToClipboard(csv);
      addToast('CSVをクリップボードにコピーしました', 'success');
    } catch {
      addToast('コピーに失敗しました', 'error');
    }
  }, [selectedEntries, addToast]);

  const handleStatusChange = useCallback(
    async (e: React.ChangeEvent<HTMLSelectElement>) => {
      const newStatus = e.target.value as EntryStatus;
      if (!newStatus || selectedEntries.length === 0) return;
      try {
        const ids = selectedEntries.map((entry) => entry.id);
        await onStatusChange(ids, newStatus);
        onClearSelection();
        addToast(`${ids.length}件のステータスを変更しました`, 'success');
      } catch {
        addToast('ステータスの変更に失敗しました', 'error');
      }
    },
    [selectedEntries, onStatusChange, onClearSelection, addToast],
  );

  const handleExportReport = useCallback(async () => {
    if (selectedEntries.length === 0) {
      addToast('レポート対象を選択してください', 'warning');
      return;
    }
    try {
      const [{ exportInspectionReport }, { data }] = await Promise.all([
        import('@/lib/report'),
        supabase.from(TABLES.properties).select('*').order('property_code'),
      ]);
      exportInspectionReport(selectedEntries, (data ?? []) as DbProperty[]);
      addToast('点検レポートをダウンロードしました', 'success');
    } catch {
      addToast('レポートの生成に失敗しました', 'error');
    }
  }, [selectedEntries, addToast]);

  const handleDownloadImages = useCallback(async () => {
    if (selectedEntries.length === 0) {
      addToast('ダウンロード対象を選択してください', 'warning');
      return;
    }
    setDownloading(true);
    try {
      const { downloadCustomImages } = await import('@/lib/zipDownload');
      const count = await downloadCustomImages(selectedEntries);
      if (count === 0) {
        addToast('ダウンロード対象の追加画像がありません', 'info');
      } else {
        addToast(`${count}件の画像をダウンロードしました`, 'success');
      }
    } catch {
      addToast('画像のダウンロードに失敗しました', 'error');
    } finally {
      setDownloading(false);
    }
  }, [selectedEntries, addToast]);

  if (selectedEntries.length === 0) return null;

  return (
    <div className="flex flex-wrap items-center gap-3 rounded-md bg-blue-50 px-4 py-2">
      <span className="text-sm font-medium text-blue-800">
        {selectedEntries.length}件選択中
      </span>
      <div className="w-40">
        <Select
          options={statusOptions}
          placeholder="ステータス変更"
          value=""
          onChange={handleStatusChange}
        />
      </div>
      <Button size="sm" variant="primary" onClick={handleExportCsv}>
        CSVエクスポート
      </Button>
      <Button size="sm" variant="secondary" onClick={handleCopyCsv}>
        CSVコピー
      </Button>
      <Button size="sm" variant="secondary" onClick={handleExportReport}>
        点検レポート
      </Button>
      <Button size="sm" variant="secondary" onClick={handleDownloadImages} disabled={downloading}>
        {downloading ? 'DL中...' : '追加画像DL'}
      </Button>
      <Button size="sm" variant="ghost" onClick={onClearSelection}>
        選択解除
      </Button>
    </div>
  );
}

