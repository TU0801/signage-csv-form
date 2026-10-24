import type { PosterType } from '@/lib/constants';

/** 入力フォームの値（v1 index.html の各入力欄） */
export interface SingleEntryValues {
  propertyCode: string;
  /** 端末は任意（v1 8f7c1f6。未設置物件は空） */
  terminalId: string;
  /** 案内カテゴリ（'' = 全て） */
  category: string;
  /** 点検工事案内（signage_master_inspection_types.id。'' = 未選択） */
  inspectionTypeId: string;
  posterType: PosterType;
  noticeText: string;
  /** 選択中の点検種別の template_no（v1 の currentTemplateNo） */
  templateNo: string;
  startDate: string;
  endDate: string;
  remarks: string;
  /** メモ（CSV に出さない。点検月の変更などの覚え書き。signage_entries.memo） */
  memo: string;
  displayStartDate: string;
  displayStartTime: string;
  displayEndDate: string;
  displayEndTime: string;
  /** 表示時間（秒）。入力欄の文字列のまま持つ */
  displayTime: string;
  /** 表示位置（v1 currentPosition。1〜4, 0=全体） */
  frameNo: number;
}

/** 追加（カスタム）貼紙の画像。申請するときにアップロードする */
export interface CustomImage {
  file: File;
  /** プレビュー用の data URL（v1 window.customImageData） */
  dataUrl: string;
}

/** 申請前の手元のデータ（v1 script.js addEntry の entry） */
export interface LocalEntry {
  _id: string;
  propertyCode: string;
  propertyName: string;
  terminalId: string;
  vendorName: string;
  emergencyContact: string;
  inspectionType: string;
  templateNo: string;
  startDate: string;
  endDate: string;
  remarks: string;
  /** メモ（CSV に出さない）。古い作成データには無い */
  memo?: string;
  noticeText: string;
  frameNo: number;
  displayStartDate: string;
  displayEndDate: string;
  displayStartTime: string;
  displayEndTime: string;
  displayTime: number;
  posterType: PosterType;
  customImage: CustomImage | null;
  /**
   * 点検行に結び付けるときの保守会社（追加した時点の、保守会社のアカウントは自社・管理者は選んだ会社。未選択は null）。
   * vendorName（v1 準拠で一般ユーザーは社名順の先頭の会社）とは別。古い作成データには無い（申請時の保守会社で補う）
   */
  linkVendorId?: string | null;
  /**
   * 点検行に結び付けるときの点検種別（追加の貼紙だけ。inspectionType は「追加画像」に固定されるので、フォームが内部に持つ
   * 点検工事案内の名前を残す。選ばれていなければ ''）。テンプレートの貼紙は inspectionType で照合する。古い作成データには無い
   */
  linkInspectionType?: string;
}
