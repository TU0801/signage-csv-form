import type { BulkProperty, BulkRowInput } from '../types';

/** 貼り付けの列（6列固定。v1.29.2 で統一）。テンプレートCSVとヘルプ表示もこの順 */
export const PASTE_COLUMNS = ['物件名', '端末ID', '点検種別', '開始日', '終了日', '備考'] as const;

/** 先頭行をヘッダーとみなす語（1列目か2列目が一致したら飛ばす） */
const HEADER_KEYWORDS = ['物件コード', '物件名', '物件', 'property', '端末id', '端末', 'terminal', '保守会社', '業者', 'vendor'];

export interface PasteResult {
  rows: BulkRowInput[];
  /** 物件名・物件コードがマスターに無かった行の数（行は物件エラーで残す） */
  unresolvedCount: number;
  /** 物件・端末・点検種別がどれも無く、空白でもない行の数（飛ばす） */
  errorCount: number;
}

/** YYYY/M/D・YYYY-M-D を YYYY-MM-DD にする。読めなければ空。v1: js/bulk-modals.js formatDateForInput */
export function formatDateForInput(dateStr: string): string {
  if (!dateStr) return '';
  const match = dateStr.match(/(\d{4})[/-](\d{1,2})[/-](\d{1,2})/);
  if (match) {
    return `${match[1]}-${match[2]!.padStart(2, '0')}-${match[3]!.padStart(2, '0')}`;
  }
  return '';
}

/**
 * Excel から貼り付けたタブ区切りテキストを行にする。
 * 列: 0 物件名/物件コード, 1 端末ID, 2 点検種別, 3 開始日, 4 終了日, 5 備考（6・7列目に案内文・表示位置があれば読む）。
 * - 全体を trim しない（先頭セルが空の行で列がずれないように）。末尾の空行だけ落とす
 * - 物件は名前とコードの両方で照合し、見つからなければ空にして行は残す（黙って取り込まない）
 * v1: js/bulk-modals.js importFromPaste
 */
export function parseExcelPaste(raw: string, properties: BulkProperty[]): PasteResult {
  const lines = raw.split(/\r?\n/);
  while (lines.length > 0 && lines[lines.length - 1]!.trim() === '') lines.pop();

  let startIndex = 0;
  const firstCols = (lines[0] || '').split('\t');
  const firstColLower = (firstCols[0] || '').toLowerCase().trim();
  const secondColLower = (firstCols[1] || '').toLowerCase().trim();
  const isHeaderRow = HEADER_KEYWORDS.some(
    (keyword) => firstColLower === keyword.toLowerCase() || secondColLower === keyword.toLowerCase(),
  );
  if (isHeaderRow) startIndex = 1;

  const rows: BulkRowInput[] = [];
  let errorCount = 0;
  let unresolvedCount = 0;

  for (let i = startIndex; i < lines.length; i++) {
    const line = lines[i]!;
    const cols = line.split('\t');
    const propValue = cols[0]?.trim() || '';
    const terminalId = cols[1]?.trim() || '';
    const inspectionType = cols[2]?.trim() || '';

    if (!propValue && !terminalId && !inspectionType) {
      if (line.trim() !== '') errorCount++;
      continue;
    }

    const property = properties.find(
      (p) => p.propertyName === propValue || String(p.propertyCode) === String(propValue),
    );
    if (!property && propValue) unresolvedCount++;

    rows.push({
      propertyCode: property?.propertyCode || '',
      terminalId,
      inspectionType,
      startDate: formatDateForInput(cols[3]?.trim() || ''),
      endDate: formatDateForInput(cols[4]?.trim() || ''),
      remarks: cols[5]?.trim() || '',
      noticeText: cols[6]?.trim() || '',
      position: cols[7] ? parseInt(cols[7]) : 2,
    });
  }

  return { rows, unresolvedCount, errorCount };
}

/**
 * 貼り付け用テンプレートCSV（BOM付き UTF-8、カンマ区切り、LF）。
 * v1: js/bulk-modals.js downloadExcelTemplate
 */
export function buildPasteTemplateCsv(): string {
  const example1 = ['アソシアグロッツォ天神サウス', 'z1003A01', 'エレベーター定期点検', '2025/1/15', '2025/1/15', '午前中'];
  const example2 = ['アソシアグロッツォタイムズスイート博多', 'h0001A00', '消防設備点検', '2025/2/1', '2025/2/3', ''];
  return [[...PASTE_COLUMNS], example1, example2].map((row) => row.join(',')).join('\n');
}
