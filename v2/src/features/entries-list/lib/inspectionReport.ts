import type { DbEntry } from '@/types/database';

export const REPORT_HEADERS = [
  '物件コード',
  '物件名',
  '点検種別',
  '点検開始日',
  '点検終了日',
  '作業時間及び備考',
  '保守会社',
  '登録日時',
];

/** 点検レポートのシート（タイトル4行 + 見出し + データ行） */
// v1: js/admin-export.js exportInspectionReport（シートデータ部分）
export function buildInspectionReportSheet(
  entries: DbEntry[],
  propertyNames: Map<string, string>,
  now: Date = new Date(),
): string[][] {
  const data = entries.map((entry) => [
    entry.property_code || '',
    propertyNames.get(entry.property_code) || '',
    entry.inspection_type || '',
    entry.inspection_start ? new Date(entry.inspection_start).toLocaleDateString('ja-JP') : '',
    entry.inspection_end ? new Date(entry.inspection_end).toLocaleDateString('ja-JP') : '',
    entry.remarks || '',
    entry.vendor_name || '',
    entry.created_at ? new Date(entry.created_at).toLocaleString('ja-JP') : '',
  ]);
  const titleRows = [
    ['点検レポート'],
    [`出力日時: ${now.toLocaleString('ja-JP')}`],
    [`対象件数: ${entries.length}件`],
    [],
  ];
  return [...titleRows, REPORT_HEADERS, ...data];
}

/** 選択した行の点検レポートを xlsx でダウンロードする */
// v1: js/admin-export.js exportInspectionReport
export async function downloadInspectionReport(
  entries: DbEntry[],
  propertyNames: Map<string, string>,
): Promise<void> {
  const XLSX = await import('xlsx');
  const ws = XLSX.utils.aoa_to_sheet(buildInspectionReportSheet(entries, propertyNames));
  ws['!cols'] = [
    { wch: 12 }, // 物件コード
    { wch: 20 }, // 物件名
    { wch: 15 }, // 点検種別
    { wch: 12 }, // 開始日
    { wch: 12 }, // 終了日
    { wch: 30 }, // 備考
    { wch: 15 }, // 保守会社
    { wch: 18 }, // 登録日時
  ];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, '点検レポート');
  const timestamp = new Date().toISOString().replace(/[-:]/g, '').slice(0, 15);
  XLSX.writeFile(wb, `inspection-report-${timestamp}.xlsx`);
}
