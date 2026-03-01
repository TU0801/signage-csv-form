import { useState, useCallback } from 'react';
import { Button } from '@/components/ui/Button';
import { useBulkStore } from '@/stores/bulkStore';
import { useToast } from '@/components/ui/Toast';
import { useAuth } from '@/hooks/useAuth';
import { useEntries } from '@/hooks/useEntries';
import { generateCsv, downloadCsv, copyCsvToClipboard, type CsvEntry } from '@/lib/csv';
import { EntryStatus } from '@/lib/constants';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import type { BulkRow } from '@/types/app';

function bulkRowToCsvEntry(row: BulkRow, inspectionCo: number): CsvEntry {
  return {
    inspectionCo,
    terminalId: row.terminalId,
    propertyCode: row.propertyCode,
    vendorName: row.vendorName,
    emergencyContact: row.emergencyContact,
    inspectionType: row.inspectionType,
    showOnBoard: row.showOnBoard,
    templateNo: row.templateNo,
    startDate: row.startDate,
    endDate: row.endDate,
    remarks: row.remarks,
    noticeText: row.noticeText,
    frameNo: row.frameNo,
    displayStartDate: row.displayStartDate,
    displayEndDate: row.displayEndDate,
    displayStartTime: row.displayStartTime,
    displayEndTime: row.displayEndTime,
    displayDuration: row.displayDuration,
    posterType: row.posterType,
  };
}

export function BulkFooter() {
  const rows = useBulkStore((s) => s.rows);
  const clearAll = useBulkStore((s) => s.clearAll);
  const { addToast } = useToast();
  const { user } = useAuth();
  const { createEntry } = useEntries();
  const [submitting, setSubmitting] = useState(false);
  const [showSubmitConfirm, setShowSubmitConfirm] = useState(false);

  const validRows = rows.filter((r) => r._isValid);
  const hasValidRows = validRows.length > 0;

  const handleDownloadCsv = useCallback(() => {
    if (!hasValidRows) {
      addToast('有効な行がありません', 'warning');
      return;
    }
    const csvEntries = validRows.map((r, i) => bulkRowToCsvEntry(r, i + 1));
    const csv = generateCsv(csvEntries);
    const filename = `signage_bulk_${new Date().toISOString().slice(0, 10)}.csv`;
    downloadCsv(csv, filename);
    addToast(`${validRows.length}件のCSVをダウンロードしました`, 'success');
  }, [validRows, hasValidRows, addToast]);

  const handleCopyCsv = useCallback(async () => {
    if (!hasValidRows) {
      addToast('有効な行がありません', 'warning');
      return;
    }
    const csvEntries = validRows.map((r, i) => bulkRowToCsvEntry(r, i + 1));
    const csv = generateCsv(csvEntries);
    try {
      await copyCsvToClipboard(csv);
      addToast(`${validRows.length}件のCSVをコピーしました`, 'success');
    } catch {
      addToast('クリップボードへのコピーに失敗しました', 'error');
    }
  }, [validRows, hasValidRows, addToast]);

  const handleSubmit = useCallback(async () => {
    if (!user) {
      addToast('ログインが必要です', 'error');
      return;
    }
    if (!hasValidRows) {
      addToast('有効な行がありません', 'warning');
      return;
    }

    setSubmitting(true);
    let successCount = 0;
    let errorCount = 0;

    for (const row of validRows) {
      try {
        await createEntry({
          user_id: user.id,
          property_code: row.propertyCode,
          terminal_id: row.terminalId,
          vendor_name: row.vendorName,
          emergency_contact: row.emergencyContact || null,
          inspection_type: row.inspectionType,
          template_no: row.templateNo || null,
          inspection_start: row.startDate || null,
          inspection_end: row.endDate || null,
          display_start_date: row.displayStartDate || null,
          display_start_time: row.displayStartTime || null,
          display_end_date: row.displayEndDate || null,
          display_end_time: row.displayEndTime || null,
          display_duration: row.displayDuration || null,
          announcement: row.noticeText || null,
          remarks: row.remarks || null,
          poster_type: row.posterType || null,
          poster_position: row.posterPosition || null,
          frame_no: row.frameNo || null,
          status: EntryStatus.PENDING,
          poster_image: null,
        });
        successCount++;
      } catch {
        errorCount++;
      }
    }

    setSubmitting(false);

    if (successCount > 0) {
      addToast(`${successCount}件を申請しました`, 'success');
      if (errorCount === 0) {
        clearAll();
      }
    }
    if (errorCount > 0) {
      addToast(`${errorCount}件の申請に失敗しました`, 'error');
    }
  }, [user, validRows, hasValidRows, createEntry, addToast, clearAll]);

  return (
    <div className="flex items-center justify-between border-t border-gray-200 bg-gray-50 px-4 py-3 rounded-b-lg">
      <div className="text-sm text-gray-600">
        有効: <strong>{validRows.length}</strong> / {rows.length}件
      </div>
      <div className="flex items-center gap-2">
        <Button
          size="sm"
          variant="secondary"
          onClick={handleCopyCsv}
          disabled={!hasValidRows}
        >
          CSVコピー
        </Button>
        <Button
          size="sm"
          variant="secondary"
          onClick={handleDownloadCsv}
          disabled={!hasValidRows}
        >
          CSVダウンロード
        </Button>
        <Button
          size="sm"
          variant="primary"
          onClick={() => setShowSubmitConfirm(true)}
          disabled={!hasValidRows || submitting}
        >
          {submitting ? '送信中...' : `一括申請 (${validRows.length}件)`}
        </Button>
      </div>

      <ConfirmDialog
        open={showSubmitConfirm}
        onClose={() => setShowSubmitConfirm(false)}
        onConfirm={handleSubmit}
        title="一括申請"
        message={`有効な${validRows.length}件を申請しますか？`}
        confirmLabel="申請する"
      />
    </div>
  );
}
