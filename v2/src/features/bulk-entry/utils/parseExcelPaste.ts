import type { BulkRow } from '@/types/app';
import { DEFAULT_DISPLAY_DURATION } from '@/lib/constants';

/**
 * TSV column mapping: header text -> BulkRow field.
 * Supports both Japanese headers from CSV and English field names.
 */
const COLUMN_MAP: Record<string, keyof BulkRow> = {
  '物件コード': 'propertyCode',
  'propertyCode': 'propertyCode',
  '端末ID': 'terminalId',
  'terminalId': 'terminalId',
  '保守会社名': 'vendorName',
  'vendorName': 'vendorName',
  '緊急連絡先番号': 'emergencyContact',
  'emergencyContact': 'emergencyContact',
  '点検工事案内': 'inspectionType',
  '点検種別': 'inspectionType',
  'inspectionType': 'inspectionType',
  '点検案内TPLNo': 'templateNo',
  'templateNo': 'templateNo',
  '点検開始日': 'startDate',
  'startDate': 'startDate',
  '点検完了日': 'endDate',
  'endDate': 'endDate',
  '表示開始日': 'displayStartDate',
  'displayStartDate': 'displayStartDate',
  '表示開始時刻': 'displayStartTime',
  'displayStartTime': 'displayStartTime',
  '表示終了日': 'displayEndDate',
  'displayEndDate': 'displayEndDate',
  '表示終了時刻': 'displayEndTime',
  'displayEndTime': 'displayEndTime',
  '表示時間': 'displayDuration',
  'displayDuration': 'displayDuration',
  '掲示備考': 'remarks',
  'remarks': 'remarks',
  '掲示板用案内文': 'noticeText',
  'noticeText': 'noticeText',
  '貼紙区分': 'posterType',
  'posterType': 'posterType',
  'frame_No': 'frameNo',
  'frameNo': 'frameNo',
};

/** Fixed column order when no header row is detected */
const DEFAULT_COLUMNS: (keyof BulkRow)[] = [
  'propertyCode',
  'terminalId',
  'vendorName',
  'emergencyContact',
  'inspectionType',
  'templateNo',
  'startDate',
  'endDate',
  'displayStartDate',
  'displayStartTime',
  'displayEndDate',
  'displayEndTime',
  'displayDuration',
  'noticeText',
  'remarks',
];

function normalizeDate(val: string): string {
  // Convert YYYY/MM/DD to YYYY-MM-DD
  return val.replace(/\//g, '-');
}

function isHeaderRow(cells: string[]): boolean {
  const matched = cells.filter((c) => COLUMN_MAP[c.trim()] !== undefined);
  return matched.length >= 3;
}

export function parseExcelPaste(text: string): BulkRow[] {
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0);

  if (lines.length === 0) return [];

  const firstRow = lines[0]!.split('\t');
  let columns: (keyof BulkRow | null)[];
  let dataStart: number;

  if (isHeaderRow(firstRow)) {
    columns = firstRow.map((h) => COLUMN_MAP[h.trim()] ?? null);
    dataStart = 1;
  } else {
    columns = DEFAULT_COLUMNS.map((c) => c);
    dataStart = 0;
  }

  const rows: BulkRow[] = [];

  for (let i = dataStart; i < lines.length; i++) {
    const cells = lines[i]!.split('\t');
    const row: BulkRow = {
      _id: crypto.randomUUID(),
      _errors: {},
      _isValid: true,
      propertyCode: '',
      terminalId: '',
      vendorName: '',
      emergencyContact: '',
      inspectionType: '',
      templateNo: '',
      startDate: '',
      endDate: '',
      displayStartDate: '',
      displayStartTime: '',
      displayEndDate: '',
      displayEndTime: '',
      displayDuration: DEFAULT_DISPLAY_DURATION,
      noticeText: '',
      remarks: '',
      posterType: 'template',
      posterPosition: '4',
      frameNo: '1',
      showOnBoard: true,
    };

    for (let j = 0; j < cells.length && j < columns.length; j++) {
      const field = columns[j];
      if (!field || field.startsWith('_')) continue;
      const val = cells[j]!.trim();
      if (!val) continue;

      if (field === 'displayDuration') {
        const num = parseInt(val, 10);
        if (!isNaN(num)) row.displayDuration = num;
      } else if (field === 'showOnBoard') {
        row.showOnBoard = val.toLowerCase() === 'true' || val === '1';
      } else if (
        field === 'startDate' ||
        field === 'endDate' ||
        field === 'displayStartDate' ||
        field === 'displayEndDate'
      ) {
        row[field] = normalizeDate(val);
      } else if (field === 'posterType') {
        row.posterType = val === '追加' || val === 'custom' ? 'custom' : 'template';
      } else {
        (row as Record<string, unknown>)[field] = val;
      }
    }

    rows.push(row);
  }

  return rows;
}
