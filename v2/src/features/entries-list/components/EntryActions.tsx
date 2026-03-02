import { useState, useCallback } from 'react';
import { Button } from '@/components/ui/Button';
import { Select } from '@/components/ui/Select';
import { useToast } from '@/components/ui/Toast';
import { supabase, TABLES } from '@/lib/supabase';
import { EntryStatus } from '@/lib/constants';
import { generateCsv, downloadCsv, copyCsvToClipboard } from '@/lib/csv';
import type { CsvEntry } from '@/lib/csv';
import type { DbEntry, DbProperty } from '@/types/database';
import { formatDateISO } from '@/lib/utils';

interface EntryActionsProps {
  selectedEntries: DbEntry[];
  onStatusChange: (ids: string[], status: EntryStatus) => Promise<void>;
  onClearSelection: () => void;
}

function dbEntryToCsvEntry(entry: DbEntry): CsvEntry {
  return {
    inspectionCo: entry.inspection_co,
    terminalId: entry.terminal_id,
    propertyCode: entry.property_code,
    vendorName: entry.vendor_name,
    emergencyContact: entry.emergency_contact ?? '',
    inspectionType: entry.inspection_type,
    showOnBoard: true,
    templateNo: entry.template_no ?? '',
    startDate: entry.inspection_start ?? '',
    endDate: entry.inspection_end ?? '',
    remarks: entry.remarks ?? '',
    noticeText: entry.announcement ?? '',
    frameNo: entry.frame_no ?? '',
    displayStartDate: entry.display_start_date ?? '',
    displayEndDate: entry.display_end_date ?? '',
    displayStartTime: entry.display_start_time ?? '',
    displayEndTime: entry.display_end_time ?? '',
    displayDuration: entry.display_duration ?? 0,
    posterType: entry.poster_type ?? '',
  };
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

  const handleExportCsv = useCallback(() => {
    if (selectedEntries.length === 0) {
      addToast('エクスポートするエントリーを選択してください', 'warning');
      return;
    }
    const csvEntries = selectedEntries.map(dbEntryToCsvEntry);
    const csv = generateCsv(csvEntries);
    const filename = `signage_entries_${formatDateISO(new Date())}.csv`;
    downloadCsv(csv, filename);
    addToast(`${selectedEntries.length}件をCSVエクスポートしました`, 'success');
  }, [selectedEntries, addToast]);

  const handleCopyCsv = useCallback(async () => {
    if (selectedEntries.length === 0) {
      addToast('コピーするエントリーを選択してください', 'warning');
      return;
    }
    try {
      const csvEntries = selectedEntries.map(dbEntryToCsvEntry);
      const csv = generateCsv(csvEntries);
      await copyCsvToClipboard(csv);
      addToast(`${selectedEntries.length}件をクリップボードにコピーしました`, 'success');
    } catch {
      addToast('クリップボードへのコピーに失敗しました', 'error');
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

export { dbEntryToCsvEntry };
