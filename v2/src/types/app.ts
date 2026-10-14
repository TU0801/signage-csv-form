import type {
  DbEntry,
  DbVendor,
  DbInspectionType,
  DbCategory,
  DbTemplateImage,
  Terminal,
} from './database';
import type { RpcUnitInspectionTypeOption } from './rpc';

/** 物件×点検種別（v1 overlayInspections 後の prop.equipment の1要素） */
export interface PropertyInspection {
  inspection_type_id: string;
  vendor_id: string | null;
  inspection_months: number[];
  remarks: string;
  remarks2: string;
  /** 保守会社用の設備コード（業務システム側で入力）。未指定なら保存時に今の値を引き継ぐ */
  maintainer_equipment_code?: string | null;
}

/** 台ごとの保守の1行（v1 overlayUnitInspections の unit.inspections の1要素） */
export interface UnitInspection {
  /** 新しく足した行は無い */
  inspection_id?: string;
  inspection_type_id: string;
  inspection_type_label: string;
  vendor_id: string | null;
  vendor_name: string;
  inspection_months: number[];
  inspected_on: string | null;
  legacy_remarks: string;
  legacy_remarks2: string;
}

/** 台（v1 overlayUnitInspections の prop.units の1要素） */
export interface PropertyUnit {
  unit_id: string;
  category_code: string;
  category_label: string;
  unit_code: string;
  unit_location: string;
  unit_remarks: string;
  unit_remarks2: string;
  inspections: UnitInspection[];
}

/** 画面で使う物件（端末を正規化し、点検情報を biz から被せたもの。v1 getAllMasterData の properties） */
export interface MasterProperty {
  id: string;
  property_code: string;
  property_name: string;
  terminals: Terminal[];
  /** biz の点検情報（RPC 失敗時は移行前の equipment jsonb） */
  inspections: PropertyInspection[];
}

export type UnitInspectionTypeOption = RpcUnitInspectionTypeOption;

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
  customPosterUrl?: string;
}

/** エントリー一覧表示用 */
export interface EntryRow extends DbEntry {
  propertyName?: string;
}

/** マスターデータ一括取得結果 */
export interface MasterData {
  properties: MasterProperty[];
  vendors: DbVendor[];
  inspectionTypes: DbInspectionType[];
  categories: DbCategory[];
  templateImages: DbTemplateImage[];
}

/** トースト通知 */
export interface Toast {
  id: string;
  message: string;
  type: 'info' | 'success' | 'error' | 'warning';
}
