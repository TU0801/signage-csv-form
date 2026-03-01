import type { DbEntry, DbProperty, DbVendor, DbInspectionType, DbCategory } from './database';

/** camelCase変換済みエントリー（フォーム用） */
export interface EntryFormData {
  propertyCode: string;
  terminalId: string;
  vendorName: string;
  emergencyContact: string;
  inspectionType: string;
  templateNo: string;
  startDate: string;
  endDate: string;
  displayStartDate: string;
  displayStartTime: string;
  displayEndDate: string;
  displayEndTime: string;
  displayDuration: number;
  noticeText: string;
  remarks: string;
  posterType: 'template' | 'custom';
  posterPosition: string;
  frameNo: string;
  showOnBoard: boolean;
}

/** エントリー一覧表示用 */
export interface EntryRow extends DbEntry {
  propertyName?: string;
}

/** マスターデータ一括取得結果 */
export interface MasterData {
  properties: DbProperty[];
  vendors: DbVendor[];
  inspectionTypes: DbInspectionType[];
  categories: DbCategory[];
}

/** 一括入力行 */
export interface BulkRow extends EntryFormData {
  _id: string;
  _errors: Record<string, string>;
  _isValid: boolean;
}

/** トースト通知 */
export interface Toast {
  id: string;
  message: string;
  type: 'info' | 'success' | 'error' | 'warning';
}
