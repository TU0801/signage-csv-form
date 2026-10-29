/**
 * 一括入力の型。v1 の行・マスターデータの形（camelCase）にそのまま合わせる。
 * 自動保存（bulk_autosave_*）とテンプレート（bulk_templates）の localStorage も同じ名前で読み書きするため、
 * 共有の EntryFormData / BulkRow ではなくこちらを使う。
 */

import type { DbTemplateImage } from '@/types/database';
import type { ExtraPoster } from '@/lib/extraPosters';

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
  /**
   * 連絡先（CSV 5列目「緊急連絡先番号」・申請の emergency_contact）。空なら画面上部の保守会社の緊急連絡先（保守会社マスター）。
   * 詳細設定で書き換えたときだけ値が入る（B18）
   */
  emergencyContact: string;
  /** 貼紙（template＝点検種別のテンプレート / custom＝追加の画像。B18） */
  posterType: 'template' | 'custom';
  /** 追加の貼紙画像の公開 URL（poster-images に選んだ時点でアップロード済み。File は持たない） */
  posterImage: string;
  /**
   * 2枚目以降の貼紙（修正依頼1025 D3。アップロード済みの URL かライブラリの URL）。テンプレートの貼紙にも足せる。
   * 申請で signage_entries.extra_posters に入り、CSV では枚数分の行になる。古い自動保存・テンプレートには無い
   */
  extraPosters?: ExtraPoster[];
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
  /**
   * 申請済みの申請を修正している行（schedule.editEntryId）で点検種別を変えたときの、付け替える点検（修正依頼1029 決定④）。
   * 『申請する』でその申請の点検種別・テンプレートNo・紐付けを直す。行は元の予定の行のまま（読み直しで新しい点検の行に出る）
   */
  relink?: { inspectionId: string; unitId: string | null };
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
  /** 物件の下に出す設備会社固有の No（台の unit_code・点検行の設備会社固有コード。修正依頼1025 H2）。無ければ物件コードだけ */
  unitCode?: string | null;
  /** 2台目以降の行（H1。修正依頼1026 I7: 申請・完了連絡は台ごと、報告書UP は1台目の行だけ） */
  secondary?: boolean;
  /** 台ごとの行の台（biz.property_units.id。修正依頼1026 I7）。申請の property_unit_id に入る。台なしの行は無し */
  unitId?: string;
  /**
   * 申請済み（承認前）の申請を修正している行（修正依頼1026 I11）。その申請の id。
   * 行は入力できる（locked でない）状態になり、『申請する』で新しい申請ではなくこの申請を直す
   */
  editEntryId?: string;
  /** 申請不要（報告書のみ）の点検（H4/G4）。申請の欄を出さない（locked） */
  reportOnly?: boolean;
  /** 点検月以外の月の行（D5「全ての月」） */
  offMonth?: boolean;
}

/** 行を作るときに渡す値（v1 addRow の data） */
export type BulkRowInput = Partial<Omit<BulkEntryRow, 'id' | 'isValid' | 'errors'>>;

/** 物件（端末ごとに1件へ展開した形）。v1: getAllMasterDataCamelCase の properties */
export interface BulkProperty {
  propertyCode: string;
  propertyName: string;
  terminalId: string;
  supplement: string;
  /**
   * 未承認の建物（建物追加の申請 id）。物件コードは仮のコード REQ-…・端末は無い（修正依頼1025 F2）。
   * 申請に property_request_id として入り、建物の承認で正式な物件コードに付け替わる
   */
  propertyRequestId?: string;
  /** 未承認の建物の管理会社（申請で選んだもの。管理会社フィルターに使う） */
  managementCompanyId?: string;
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
  /** テンプレート画像（詳細設定のプレビューとテンプレート名。template_images_master） */
  templateImages?: Pick<DbTemplateImage, 'image_key' | 'image_url' | 'display_name'>[];
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
