import { formatDateSlash, formatDateTime, formatDisplayTime } from './utils';

/**
 * CSV 28列ヘッダー（固定順序）
 */
export const CSV_HEADERS = [
  '点検CO',
  '端末ID',
  '物件コード',
  '受注先名',
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

/**
 * CSV生成用エントリー型（旧経路）
 * @deprecated 本番出力は generateAdminCsv（v1 admin-export.js 準拠）を使う
 */
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

/**
 * エントリーを28列のCSV行配列に変換（旧経路）
 * @deprecated generateAdminCsv を使う
 */
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

/**
 * 複数エントリーからCSV文字列を生成（旧経路）
 * @deprecated generateAdminCsv を使う（行区切り・掲示板表示・追加画像行などが v1 本番出力と異なる）
 */
export function generateCsv(entries: CsvEntry[]): string {
  const headerLine = CSV_HEADERS.map(escapeCsvValue).join(',');
  const dataLines = entries.map((entry) => entryToCsvRow(entry).map(escapeCsvValue).join(','));
  return [headerLine, ...dataLines].join('\r\n');
}

/** CSVをBlobとしてダウンロード（BOM付き UTF-8。v1 admin-export.js exportCSV と同じ組み立て） */
export function downloadCsv(csv: string, filename: string): void {
  const bom = new Uint8Array([0xef, 0xbb, 0xbf]);
  const blob = new Blob([bom, csv], { type: 'text/csv;charset=utf-8' });
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

// ---------------------------------------------------------------------------
// 本番出力（v1 js/admin-export.js generateCSV とバイト一致させる）
// 長谷工側の取込に使われるため、v1 の癖（UTC/ローカル混在など）もそのまま再現する
// ---------------------------------------------------------------------------

/** CSV出力・追加画像DLの対象になる承認ステータス（v1 APPROVED_STATUSES） */
export const APPROVED_STATUSES = ['ready', 'exported'] as const;

/** generateAdminCsv が読む signage_entries の列（DbEntry はこの型に代入できる） */
export interface CsvSourceEntry {
  id?: string | null;
  status?: string | null;
  inspection_co?: number | null;
  terminal_id?: unknown;
  property_code?: string | null;
  vendor_name?: string | null;
  emergency_contact?: string | null;
  inspection_type?: string | null;
  template_no?: string | null;
  inspection_start?: string | null;
  inspection_end?: string | null;
  display_start_date?: string | null;
  display_end_date?: string | null;
  display_start_time?: string | null;
  display_end_time?: string | null;
  display_duration?: number | null;
  remarks?: string | null;
  announcement?: string | null;
  poster_type?: string | null;
  poster_position?: string | null;
  poster_image?: string | null;
}

/** 承認済み（ready/exported）だけに絞る */
export function filterApprovedEntries<T extends { status?: string | null }>(entries: T[]): T[] {
  const approved: readonly (string | null | undefined)[] = APPROVED_STATUSES;
  return entries.filter((e) => approved.includes(e.status));
}

/**
 * 追加画像のファイル名（拡張子なし）: 物件コード_点検種別_ID先頭8文字
 * ZIP内ファイル名と CSV の点検案内TPLNo をこの関数で揃える（サイネージ側は名前一致で登録する）
 */
export function customImageBaseName(
  entry: Pick<CsvSourceEntry, 'property_code' | 'inspection_type' | 'id'>,
): string {
  const safe = (v: string | null | undefined) => (v || 'unknown').replace(/[/\\:*?"<>|]/g, '_');
  return `${safe(entry.property_code)}_${safe(entry.inspection_type)}_${String(entry.id || '').slice(0, 8)}`;
}

/** terminal_id 正規化（JSON文字列・オブジェクトなら terminalId/terminal_id/id を取り出す。v1 shared-utils と同じ） */
export function normalizeTerminalId(terminalId: unknown): string {
  if (!terminalId) return '';
  if (typeof terminalId === 'string') {
    if (terminalId.startsWith('{')) {
      try {
        const parsed = JSON.parse(terminalId);
        return parsed.terminalId || parsed.terminal_id || parsed.id || terminalId;
      } catch {
        return terminalId;
      }
    }
    return terminalId;
  }
  if (typeof terminalId === 'object') {
    const o = terminalId as Record<string, string | undefined>;
    return o.terminalId || o.terminal_id || o.id || '';
  }
  return String(terminalId);
}

/** CSVフィールドのエスケープ（カンマ・ダブルクォート・LF を含む場合だけクォート。v1 escapeCSVField） */
function escapeCsvField(v: unknown): string {
  if (v == null) return '';
  const s = String(v);
  return s.includes(',') || s.includes('"') || s.includes('\n') ? '"' + s.replace(/"/g, '""') + '"' : s;
}

/**
 * 本番CSV（管理画面の CSV 出力・コピー）を生成する。ステータスでは絞らないので呼び出し側で filterApprovedEntries を通す。
 * ダウンロードは downloadCsv（BOM付き）、コピーは BOM なしでそのまま渡す（v1 と同じ）
 * @param displayTimeDefault 設定 display_time_default（signage_master_settings.setting_value は text）
 */
export function generateAdminCsv(
  data: CsvSourceEntry[],
  displayTimeDefault: string | number | null | undefined,
): string {
  if (data.length === 0) return '';

  const now = new Date();
  // 変更日は UTC の日付、変更日時の時刻はローカル時刻（v1 と同じ混在。JST 0:00〜8:59 は日付が前日になる）
  const dateStr = now.toISOString().split('T')[0]!.replace(/-/g, '/');
  const timeStr = now.toTimeString().substring(0, 8);

  const csvRows = [CSV_HEADERS.join(',')];

  const formatDate = (d: string | null | undefined) => (d ? d.replace(/-/g, '/') : '');
  const defaultTime = displayTimeDefault || 6;

  data.forEach((entry) => {
    const displayTime = entry.display_duration || defaultTime;
    const displayTimeFormatted = `0:00:${String(displayTime).padStart(2, '0')}`;

    const sd = formatDate(entry.inspection_start);
    const ed = formatDate(entry.inspection_end) || sd;
    const dsd = formatDate(entry.display_start_date || entry.inspection_start);
    const ded = formatDate(entry.display_end_date || entry.inspection_end) || ed;
    const displayStartTime = entry.display_start_time || '';
    const displayEndTime = entry.display_end_time || '';

    const remarksText = (entry.remarks || '').replace(/\n/g, '\r\n');
    const noticeText = (entry.announcement || '').replace(/\n/g, '\r\n');

    // 追加画像は画像そのものを表示するため、点検工事案内・日付・備考・案内文を空にする
    // （入れるとサイネージ側で画像に文字が合成される）
    const isCustom = entry.poster_type === 'custom';
    const posterTypeText = entry.poster_type === 'template' ? 'テンプレート' : '追加';
    const frameNo = entry.poster_position || '2';

    const values = [
      entry.inspection_co || '', // 点検CO
      normalizeTerminalId(entry.terminal_id), // 端末ID
      entry.property_code || '', // 物件コード
      entry.vendor_name || '', // 受注先名
      entry.emergency_contact || '', // 緊急連絡先番号
      isCustom ? '' : entry.inspection_type || '', // 点検工事案内
      'TRUE', // 掲示板に表示する
      isCustom ? customImageBaseName(entry) : entry.template_no || '', // 点検案内TPLNo
      isCustom ? '' : sd, // 点検開始日
      isCustom ? '' : ed, // 点検完了日
      isCustom ? '' : remarksText, // 掲示備考
      isCustom ? '' : noticeText, // 掲示板用案内文
      frameNo, // frame_No
      dsd, // 表示開始日
      ded, // 表示終了日
      displayStartTime, // 表示開始時刻
      displayEndTime, // 表示終了時刻
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
      posterTypeText, // 貼紙区分
    ];

    csvRows.push(values.map(escapeCsvField).join(','));
  });

  return csvRows.join('\n');
}
