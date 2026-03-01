import * as XLSX from 'xlsx';
import type { DbEntry, DbProperty } from '@/types/database';

/** 点検レポートをXLSXファイルとしてダウンロード */
export function exportInspectionReport(
  entries: DbEntry[],
  properties: DbProperty[],
): void {
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

  const data = entries.map((entry) => {
    const prop = properties.find((p) => p.property_code === entry.property_code);
    return [
      entry.property_code || '',
      prop?.property_name || '',
      entry.inspection_type || '',
      entry.inspection_start
        ? new Date(entry.inspection_start).toLocaleDateString('ja-JP')
        : '',
      entry.inspection_end
        ? new Date(entry.inspection_end).toLocaleDateString('ja-JP')
        : '',
      entry.remarks || '',
      entry.vendor_name || '',
      entry.created_at ? new Date(entry.created_at).toLocaleString('ja-JP') : '',
    ];
  });

  const now = new Date().toLocaleString('ja-JP');
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
