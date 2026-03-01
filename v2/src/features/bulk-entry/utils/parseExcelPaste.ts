import type { EntryFormData } from '@/types/app';
import { DEFAULT_DISPLAY_DURATION } from '@/lib/constants';

/**
 * TSVカラムヘッダーと EntryFormData フィールドのマッピング
 */
const COLUMN_MAP: Record<string, keyof EntryFormData> = {
  '物件コード': 'propertyCode',
  '端末ID': 'terminalId',
  '保守会社名': 'vendorName',
  '緊急連絡先': 'emergencyContact',
  '点検種別': 'inspectionType',
  '開始日': 'startDate',
  '終了日': 'endDate',
  '表示開始日': 'displayStartDate',
  '表示終了日': 'displayEndDate',
  '表示開始時刻': 'displayStartTime',
  '表示終了時刻': 'displayEndTime',
  '備考': 'remarks',
  '案内文': 'noticeText',
  'テンプレートNo': 'templateNo',
  '貼紙区分': 'posterType',
  '貼紙位置': 'posterPosition',
  'frame_No': 'frameNo',
  'frameNo': 'frameNo',
  // English aliases
  propertyCode: 'propertyCode',
  terminalId: 'terminalId',
  vendorName: 'vendorName',
  inspectionType: 'inspectionType',
  startDate: 'startDate',
  endDate: 'endDate',
  displayStartDate: 'displayStartDate',
  displayEndDate: 'displayEndDate',
  remarks: 'remarks',
};

function createEmptyFormData(): EntryFormData {
  return {
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
    posterPosition: '',
    frameNo: '',
    showOnBoard: true,
  };
}

/**
 * Normalize date strings: YYYY/MM/DD -> YYYY-MM-DD
 */
function normalizeDate(value: string): string {
  const trimmed = value.trim();
  // YYYY/MM/DD -> YYYY-MM-DD
  const slashMatch = trimmed.match(/^(\d{4})\/(\d{1,2})\/(\d{1,2})$/);
  if (slashMatch) {
    const [, y, m, d] = slashMatch;
    return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
  }
  return trimmed;
}

/**
 * TSV（タブ区切り）テキストをパースして EntryFormData の配列を返す。
 * 先頭行がヘッダー行の場合はマッピングに使用する。
 * ヘッダーなしの場合はデフォルトカラム順序を使用する。
 */
export function parseExcelPaste(text: string): Partial<EntryFormData>[] {
  const trimmedText = text.trim();
  if (!trimmedText) return [];

  const lines = trimmedText.split(/\r?\n/);
  if (lines.length === 0) return [];

  const firstLine = lines[0]!;
  const firstLineCells = firstLine.split('\t');

  // Detect whether first line is a header
  const hasHeader = firstLineCells.some((cell) => {
    const trimmed = cell.trim();
    return trimmed in COLUMN_MAP;
  });

  const DEFAULT_COLUMNS: (keyof EntryFormData)[] = [
    'propertyCode',
    'terminalId',
    'vendorName',
    'inspectionType',
    'startDate',
    'endDate',
    'displayStartDate',
    'displayEndDate',
    'remarks',
  ];

  let columnMapping: (keyof EntryFormData | null)[];
  let dataLines: string[];

  if (hasHeader) {
    columnMapping = firstLineCells.map((cell) => {
      const trimmed = cell.trim();
      return COLUMN_MAP[trimmed] ?? null;
    });
    dataLines = lines.slice(1);
  } else {
    columnMapping = DEFAULT_COLUMNS.map((col, i) => (i < firstLineCells.length ? col : null));
    dataLines = lines;
  }

  const dateFields: Set<keyof EntryFormData> = new Set([
    'startDate',
    'endDate',
    'displayStartDate',
    'displayEndDate',
  ]);

  const results: Partial<EntryFormData>[] = [];

  for (const line of dataLines) {
    if (!line.trim()) continue;

    const cells = line.split('\t');
    const row: Partial<EntryFormData> = { ...createEmptyFormData() };

    for (let i = 0; i < columnMapping.length; i++) {
      const field = columnMapping[i];
      if (!field) continue;

      const rawValue = cells[i]?.trim() ?? '';
      if (!rawValue) continue;

      if (dateFields.has(field)) {
        (row as Record<string, unknown>)[field] = normalizeDate(rawValue);
      } else if (field === 'posterType') {
        (row as Record<string, unknown>)[field] =
          rawValue === '追加' || rawValue === 'custom' ? 'custom' : 'template';
      } else if (field === 'showOnBoard') {
        (row as Record<string, unknown>)[field] =
          rawValue.toLowerCase() === 'true' || rawValue === '1' || rawValue === 'TRUE';
      } else {
        (row as Record<string, unknown>)[field] = rawValue;
      }
    }

    results.push(row);
  }

  return results;
}
