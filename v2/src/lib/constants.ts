export const EntryStatus = {
  PENDING: 'pending',
  DRAFT: 'draft',
  READY: 'ready',
  EXPORTED: 'exported',
} as const;
export type EntryStatus = (typeof EntryStatus)[keyof typeof EntryStatus];

export const Role = {
  ADMIN: 'admin',
  USER: 'user',
} as const;
export type Role = (typeof Role)[keyof typeof Role];

export const PosterType = {
  TEMPLATE: 'template',
  CUSTOM: 'custom',
} as const;
export type PosterType = (typeof PosterType)[keyof typeof PosterType];

export const BuildingVendorStatus = {
  ACTIVE: 'active',
  PENDING: 'pending',
  DELETED: 'deleted',
} as const;
export type BuildingVendorStatus = (typeof BuildingVendorStatus)[keyof typeof BuildingVendorStatus];

export const VendorInspectionStatus = {
  ACTIVE: 'active',
  INACTIVE: 'inactive',
} as const;
export type VendorInspectionStatus =
  (typeof VendorInspectionStatus)[keyof typeof VendorInspectionStatus];

export const DEFAULT_DISPLAY_DURATION = 6;
export const DISPLAY_TIME_MAX = 30;
export const REMARKS_MAX_LINES = 5;
export const REMARKS_MAX_CHARS_PER_LINE = 25;
export const NOTICE_TEXT_MAX_CHARS = 200;
/** ログイン画面の広告枠数（v1.27.0 で3枠。DB の slot_index は 1〜7 まで許すが 4〜7 は使わない） */
export const MAX_AD_SLOTS = 3;

/**
 * 追加の貼紙を PDF から作るときの PNG の大きさ（px）。マンションサイネージの画面全体（3:4、テンプレート画像と同じ 1080×1440）。
 * 貼紙表示位置（①〜④・⓪）ごとの寸法は分かっていないので全位置この大きさにする。枠ごとの寸法が分かったらここを差し替える
 * （修正依頼1024 ユーザー決定6）
 */
export const POSTER_PNG_SIZE = { width: 1080, height: 1440 } as const;
