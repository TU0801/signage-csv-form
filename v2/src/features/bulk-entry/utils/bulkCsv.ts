import { CSV_HEADERS } from '@/lib/csv';
import type { BulkEntryRow, BulkMasterData, BulkSettings, BulkVendorSelection } from '../types';

/** カンマ・ダブルクォート・LF を含むときだけクォートする。v1: js/shared-utils.js escapeCSVField */
function escapeCsvField(v: unknown): string {
  if (v == null) return '';
  const s = String(v);
  return s.includes(',') || s.includes('"') || s.includes('\n') ? '"' + s.replace(/"/g, '""') + '"' : s;
}

/**
 * 一括入力の CSV（有効な行だけ。無ければ空文字）。管理画面の本番出力（generateAdminCsv）とは別物で、
 * v1 の一括入力と同じ形にする: 行区切り LF、掲示板表示は TRUE/False、貼紙区分は常に「テンプレート」、
 * 受注先名は行の vendorName、緊急連絡先は画面上部の保守会社から引く。
 * 変更日は UTC の日付、変更日時の時刻はローカル時刻（v1 と同じ混在）。
 * v1: js/bulk-data.js generateCSV
 */
export function generateBulkCsv(
  rows: BulkEntryRow[],
  masterData: BulkMasterData,
  currentVendor: BulkVendorSelection,
  settings: BulkSettings,
): string {
  const validRows = rows.filter((r) => r.isValid);
  if (validRows.length === 0) return '';

  const now = new Date();
  const dateStr = now.toISOString().split('T')[0]!.replace(/-/g, '/');
  const timeStr = now.toTimeString().substring(0, 8);

  const csvRows = [CSV_HEADERS.join(',')];
  const formatDate = (d: string | undefined) => (d ? d.replace(/-/g, '/') : '');

  validRows.forEach((row) => {
    const property = masterData.properties.find((p) => String(p.propertyCode) === String(row.propertyCode));
    const vendor = masterData.vendors.find((v) => v.vendorName === currentVendor.name);
    const inspection = masterData.notices.find((i) => i.inspectionType === row.inspectionType);

    const displayTimeFormatted = `0:00:${String(row.displayTime || settings.display_time_default || 6).padStart(2, '0')}`;

    const sd = formatDate(row.startDate);
    const ed = formatDate(row.endDate) || sd;
    const dsd = formatDate(row.displayStartDate || row.startDate);
    const ded = formatDate(row.displayEndDate || row.endDate) || ed;

    const remarksText = (row.remarks || '').replace(/\n/g, '\r\n');
    const noticeText = (row.noticeText || inspection?.noticeText || '').replace(/\n/g, '\r\n');
    const showOnBoard = row.showOnBoard !== false ? 'TRUE' : 'False';
    const positionValue = row.position !== undefined ? String(row.position) : '2';

    const values = [
      '', // 点検CO（DB 保存後に採番）
      row.terminalId || property?.terminalId || '', // 端末ID
      row.propertyCode, // 物件コード
      row.vendorName, // 受注先名
      vendor?.emergencyContact || '', // 緊急連絡先番号
      row.inspectionType, // 点検工事案内
      showOnBoard, // 掲示板に表示する
      inspection?.templateNo || '', // 点検案内TPLNo
      sd, // 点検開始日
      ed, // 点検完了日
      remarksText, // 掲示備考
      noticeText, // 掲示板用案内文
      positionValue, // frame_No
      dsd, // 表示開始日
      ded, // 表示終了日
      row.displayStartTime || '', // 表示開始時刻
      row.displayEndTime || '', // 表示終了時刻
      displayTimeFormatted, // 表示時間
      '', // 統合ポリシー
      '', // 制御
      dateStr, // 変更日
      '', // 変更時刻
      '', // 最終エクスポート日時
      '', // ID
      `${dateStr} [${timeStr}]`, // 変更日時
      `${sd} [00:00:00]`, // 点検日時
      `${dsd} [00:00:00]`, // 表示日時
      'テンプレート', // 貼紙区分
    ];

    csvRows.push(values.map(escapeCsvField).join(','));
  });

  return csvRows.join('\n');
}

/** ダウンロード時のファイル名（bulk-YYYYMMDDTHHMMSS.csv、UTC）。v1: js/bulk-data.js downloadCSV */
export function bulkCsvFilename(now: Date = new Date()): string {
  return `bulk-${now.toISOString().replace(/[-:]/g, '').slice(0, 15)}.csv`;
}
