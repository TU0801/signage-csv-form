/**
 * 一括入力の型。v1 の行・マスターデータの形（camelCase）にそのまま合わせる。
 * 自動保存（bulk_autosave_*）とテンプレート（bulk_templates）の localStorage も同じ名前で読み書きするため、
 * 共有の EntryFormData / BulkRow ではなくこちらを使う。
 */

/** 一括入力の1行。v1: js/bulk-table.js addRow の row */
export interface BulkEntryRow {
  id: number;
  propertyCode: string;
  terminalId: string;
  vendorName: string;
  inspectionType: string;
  startDate: string;
  endDate: string;
  remarks: string;
  displayTime: number;
  noticeText: string;
  displayStartDate: string;
  displayStartTime: string;
  displayEndDate: string;
  displayEndTime: string;
  showOnBoard: boolean;
  /** 貼紙表示位置（0〜4。貼り付けの8列目が数字でないと NaN になりうる＝v1 と同じ） */
  position: number;
  isValid: boolean;
  errors: string[];
  /**
   * Excel 取込で物件が見つからなかったときの貼り付けた物件名（画面で直すときの手がかり）。
   * 申請・CSV・自動保存には入れない。物件を選び直したら消す
   */
  pastedPropertyName?: string;
}

/** 行を作るときに渡す値（v1 addRow の data） */
export type BulkRowInput = Partial<Omit<BulkEntryRow, 'id' | 'isValid' | 'errors'>>;

/** 物件（端末ごとに1件へ展開した形）。v1: getAllMasterDataCamelCase の properties */
export interface BulkProperty {
  propertyCode: string;
  propertyName: string;
  terminalId: string;
  supplement: string;
}

/** v1: getAllMasterDataCamelCase の vendors */
export interface BulkVendor {
  id: string;
  vendorName: string;
  emergencyContact: string;
}

/** v1: getAllMasterDataCamelCase の notices（点検種別） */
export interface BulkNotice {
  inspectionType: string;
  templateNo: string;
  noticeText: string;
}

export interface BulkMasterData {
  properties: BulkProperty[];
  vendors: BulkVendor[];
  notices: BulkNotice[];
}

/** v1: js/bulk-state.js state.appSettings（設定値は parseInt 済み。数値にならない値は文字列のまま） */
export interface BulkSettings {
  display_time_max: number | string;
  display_time_default: number | string;
  remarks_chars_per_line: number | string;
  remarks_max_lines: number | string;
  notice_text_max_chars: number | string;
  [key: string]: number | string;
}

/** 入力する保守会社。管理者はヘッダーで選び、一般ユーザーはプロファイルで固定 */
export interface BulkVendorSelection {
  id: string | null;
  name: string | null;
}

export type BulkFilter = 'all' | 'valid' | 'error';
