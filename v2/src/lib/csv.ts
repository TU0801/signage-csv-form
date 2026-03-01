import { formatDateSlash, formatDateTime, formatDisplayTime } from './utils';

/**
 * CSV 28列ヘッダー（固定順序）
 */
export const CSV_HEADERS = [
  '点検CO',
  '端末ID',
  '物件コード',
  '保守会社名',
  '緊急連絡先番号',
  '点検工事案内',
  '掲示板に表示する',
  '点検案内TPLNo',
  '点検開始日',
  '点検完了日',
  '掲示備考',
  '掲示板用案内文',
  'frame_No',
  '表示開始日',
  '表示終了日',
  '表示開始時刻',
  '表示終了時刻',
  '表示時間',
  '統合ポリシー',
  '制御',
  '変更日',
  '変更時刻',
  '最終エクスポート日時',
  'ID',
  '変更日時',
  '点検日時',
  '表示日時',
  '貼紙区分',
] as const;

/** CSV生成用エントリー型 */
export interface CsvEntry {
  inspectionCo: number;
  terminalId: string;
  propertyCode: string;
  vendorName: string;
  emergencyContact: string;
  inspectionType: string;
  showOnBoard: boolean;
  templateNo: string;
  startDate: string;
  endDate: string;
  remarks: string;
  noticeText: string;
  frameNo: string;
  displayStartDate: string;
  displayEndDate: string;
  displayStartTime: string;
  displayEndTime: string;
  displayDuration: number;
  posterType: string;
}

/** CSV値エスケープ（ダブルクォート対応） */
function escapeCsvValue(value: string): string {
  if (value.includes(',') || value.includes('"') || value.includes('\n')) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

/** エントリーを28列のCSV行配列に変換 */
export function entryToCsvRow(entry: CsvEntry): string[] {
  const now = new Date();
  const exportDate = formatDateSlash(now);
  const changeDatetime = formatDateTime(now);
  const inspectionDatetime = entry.startDate
    ? `${formatDateSlash(entry.startDate)} [00:00:00]`
    : '';
  const displayDatetime = entry.displayStartDate
    ? `${formatDateSlash(entry.displayStartDate)} [00:00:00]`
    : '';
  const posterLabel = entry.posterType === 'custom' ? '追加' : 'テンプレート';

  return [
    String(entry.inspectionCo),
    entry.terminalId,
    entry.propertyCode,
    entry.vendorName,
    entry.emergencyContact,
    entry.inspectionType,
    entry.showOnBoard ? 'TRUE' : 'False',
    entry.templateNo,
    entry.startDate ? formatDateSlash(entry.startDate) : '',
    entry.endDate ? formatDateSlash(entry.endDate) : '',
    entry.remarks,
    entry.noticeText,
    entry.frameNo,
    entry.displayStartDate ? formatDateSlash(entry.displayStartDate) : '',
    entry.displayEndDate ? formatDateSlash(entry.displayEndDate) : '',
    entry.displayStartTime,
    entry.displayEndTime,
    formatDisplayTime(entry.displayDuration),
    '', // 統合ポリシー（空）
    '', // 制御（空）
    exportDate,
    '', // 変更時刻（空）
    '', // 最終エクスポート日時（空）
    '', // ID（空）
    changeDatetime,
    inspectionDatetime,
    displayDatetime,
    posterLabel,
  ];
}

/** 複数エントリーからCSV文字列を生成 */
export function generateCsv(entries: CsvEntry[]): string {
  const headerLine = CSV_HEADERS.map(escapeCsvValue).join(',');
  const dataLines = entries.map((entry) => entryToCsvRow(entry).map(escapeCsvValue).join(','));
  return [headerLine, ...dataLines].join('\r\n');
}

/** CSVをBlobとしてダウンロード */
export function downloadCsv(csv: string, filename: string): void {
  const bom = '\uFEFF';
  const blob = new Blob([bom + csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

/** CSVをクリップボードにコピー */
export async function copyCsvToClipboard(csv: string): Promise<void> {
  await navigator.clipboard.writeText(csv);
}
