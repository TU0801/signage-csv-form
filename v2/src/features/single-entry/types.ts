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

/**
 * 追加（カスタム）貼紙の画像。アップロードする画像は申請するときにアップロードする。
 * 貼紙ライブラリから選んだ画像（修正依頼1025 D2）は file が null で、dataUrl にライブラリの公開 URL をそのまま持つ
 */
export interface CustomImage {
  /** アップロードする画像（ライブラリから選んだときは null） */
  file: File | null;
  /** プレビュー用の data URL（v1 window.customImageData）。ライブラリの画像は公開 URL */
  dataUrl: string;
  /** 貼紙ライブラリの行（ライブラリから選んだときだけ） */
  libraryId?: string;
  /** 名前（ライブラリの名前。アップロードはファイル名） */
  name?: string;
}

/** 2枚目以降の貼紙（修正依頼1025 D3）。申請で signage_entries.extra_posters に入る */
export interface LocalExtraPoster extends CustomImage {
  /** 表示位置（'0'〜'4'）。null は1枚目と同じ */
  position: string | null;
}

/** 追加の貼紙の名前（ファイル名かライブラリの名前） */
export function customImageName(image: Pick<CustomImage, 'file' | 'name'>): string {
  return image.file?.name ?? image.name ?? '';
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
  /** 2枚目以降の貼紙（修正依頼1025 D3）。古い作成データには無い */
  extraPosters?: LocalExtraPoster[];
  /**
   * 点検行に結び付けるときの保守会社（追加した時点の、保守会社のアカウントは自社・管理者は選んだ会社。未選択は null）。
   * 古い作成データには無い（申請時の保守会社で補う）
   */
  linkVendorId?: string | null;
  /**
   * 点検行に結び付けるときの点検種別（追加の貼紙だけ。inspectionType は「追加画像」に固定されるので、フォームが内部に持つ
   * 点検工事案内の名前を残す。選ばれていなければ ''）。テンプレートの貼紙は inspectionType で照合する。古い作成データには無い
   */
  linkInspectionType?: string;
}
