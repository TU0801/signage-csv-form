import type { DbEntry, DbProperty } from '@/types/database';
import { formatDateSlash, formatDateTime } from './utils';

/** 点検レポートをXLSXファイルとしてダウンロード */
export async function exportInspectionReport(
  entries: DbEntry[],
  properties: DbProperty[],
): Promise<void> {
  const XLSX = await import('xlsx');

  const headers = [
    '物件コード',
    '物件名',
    '点検種別',
    '点検開始日',
    '点検終了日',
    '作業時間及び備考',
    '保守会社',
    '登録日時',
  ];

  const propertyMap = new Map(properties.map((p) => [p.property_code, p.property_name]));

  const data = entries.map((entry) => [
    entry.property_code || '',
    propertyMap.get(entry.property_code) || '',
    entry.inspection_type || '',
    entry.inspection_start ? formatDateSlash(entry.inspection_start) : '',
    entry.inspection_end ? formatDateSlash(entry.inspection_end) : '',
    entry.remarks || '',
    entry.vendor_name || '',
    entry.created_at ? formatDateTime(entry.created_at) : '',
  ]);

  const now = formatDateTime(new Date());
  const titleRows: (string | number)[][] = [
    ['点検レポート'],
    [`出力日時: ${now}`],
    [`対象件数: ${entries.length}件`],
    [],
  ];

  const sheetData = [...titleRows, headers, ...data];
  const ws = XLSX.utils.aoa_to_sheet(sheetData);

  ws['!cols'] = [
    { wch: 12 },
    { wch: 20 },
    { wch: 15 },
    { wch: 12 },
    { wch: 12 },
    { wch: 30 },
    { wch: 15 },
    { wch: 18 },
  ];

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, '点検レポート');

  const timestamp = new Date().toISOString().replace(/[-:]/g, '').slice(0, 15);
  XLSX.writeFile(wb, `inspection-report-${timestamp}.xlsx`);
}
