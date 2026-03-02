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
export const MAX_AD_SLOTS = 7;
