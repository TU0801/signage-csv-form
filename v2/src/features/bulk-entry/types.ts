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
  /** メモ（CSV に出さない。点検月の変更などの覚え書き。申請の signage_entries.memo に入る） */
  memo: string;
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
  /**
   * 点検予定の行（点検行 × 対象月。portal_inspections から作る）。手で足した行には無い。
   * 物件・点検種別は点検行のもので変えられない。自動保存・テンプレートには入れない（開くたびに DB から作り直す）
   */
  schedule?: BulkScheduleMeta;
}

/** 点検予定の行の情報（ScheduleItem の key で画面側の予定と結び付ける） */
export interface BulkScheduleMeta {
  /** ScheduleItem.key（点検行 ID:対象月。点検月の無い点検は 点検行 ID:unscheduled） */
  key: string;
  /** biz.property_inspections.id */
  inspectionId: string;
  /** 対象月（YYYY-MM-01）。点検月の無い点検は null（申請の対象月は点検開始日の月） */
  targetMonth: string | null;
  /** 申請済み（承認待ち・承認済み）・差戻し中の予定。日付などを読み取りで出し、この表からは申請しない */
  locked: boolean;
  propertyName: string;
  /** 物件の端末 ID（0台の物件も申請できる＝点検一覧の申請と同じ） */
  terminalIds: string[];
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

/** v1: getAllMasterDataCamelCase の notices（点検種別）。並びは点検種別マスターの並び順 */
export interface BulkNotice {
  /** signage_master_inspection_types.id（保守会社に紐付けた点検種別を引くため） */
  id?: string;
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
