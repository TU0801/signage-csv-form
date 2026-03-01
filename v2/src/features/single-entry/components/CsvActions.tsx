import { useState } from 'react';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import { useToast } from '@/components/ui/Toast';
import { generateCsv, downloadCsv, copyCsvToClipboard, type CsvEntry } from '@/lib/csv';
import type { EntryFormData } from '@/types/app';
import { formatDateISO } from '@/lib/utils';

interface LocalEntry extends EntryFormData {
  _id: string;
}

interface CsvActionsProps {
  entries: LocalEntry[];
}

/** EntryFormData -> CsvEntry 変換 */
function toCsvEntry(entry: EntryFormData, index: number): CsvEntry {
  return {
    inspectionCo: index + 1,
    terminalId: entry.terminalId,
    propertyCode: entry.propertyCode,
    vendorName: entry.vendorName,
    emergencyContact: entry.emergencyContact,
    inspectionType: entry.inspectionType,
    showOnBoard: entry.showOnBoard,
    templateNo: entry.templateNo,
    startDate: entry.startDate,
    endDate: entry.endDate,
    remarks: entry.remarks,
    noticeText: entry.noticeText,
    frameNo: entry.frameNo,
    displayStartDate: entry.displayStartDate,
    displayEndDate: entry.displayEndDate,
    displayStartTime: entry.displayStartTime,
    displayEndTime: entry.displayEndTime,
    displayDuration: entry.displayDuration,
    posterType: entry.posterType,
  };
}

export function CsvActions({ entries }: CsvActionsProps) {
  const { addToast } = useToast();
  const [previewOpen, setPreviewOpen] = useState(false);
  const [csvPreview, setCsvPreview] = useState('');

  const disabled = entries.length === 0;

  const buildCsv = () => {
    const csvEntries = entries.map((e, i) => toCsvEntry(e, i));
    return generateCsv(csvEntries);
  };

  const handleDownload = () => {
    const csv = buildCsv();
    const today = formatDateISO(new Date());
    downloadCsv(csv, `signage_${today}.csv`);
    addToast('CSVをダウンロードしました', 'success');
  };

  const handlePreview = () => {
    const csv = buildCsv();
    setCsvPreview(csv);
    setPreviewOpen(true);
  };

  const handleCopy = async () => {
    const csv = buildCsv();
    try {
      await copyCsvToClipboard(csv);
      addToast('CSVをクリップボードにコピーしました', 'success');
    } catch {
      addToast('クリップボードへのコピーに失敗しました', 'error');
    }
  };

  return (
    <>
      <div className="flex gap-2">
        <Button variant="primary" onClick={handleDownload} disabled={disabled}>
          CSV ダウンロード
        </Button>
        <Button variant="secondary" onClick={handlePreview} disabled={disabled}>
          CSV プレビュー
        </Button>
        <Button variant="secondary" onClick={handleCopy} disabled={disabled}>
          クリップボードにコピー
        </Button>
      </div>

      <Modal
        open={previewOpen}
        onClose={() => setPreviewOpen(false)}
        title="CSV プレビュー"
        className="max-w-4xl"
      >
        <pre className="overflow-auto max-h-96 bg-gray-50 p-4 rounded text-xs font-mono whitespace-pre">
          {csvPreview}
        </pre>
        <div className="mt-4 flex justify-end">
          <Button variant="secondary" onClick={() => setPreviewOpen(false)}>
            閉じる
          </Button>
        </div>
      </Modal>
    </>
  );
}
