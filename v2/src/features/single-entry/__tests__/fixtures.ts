import { DEFAULT_APP_SETTINGS, type AppSettings } from '@/lib/api/single-entry';
import type { MasterProperty } from '@/types/app';
import type { DbInspectionType, DbVendor } from '@/types/database';
import { initialValues } from '../lib/entryLogic';
import type { LocalEntry, SingleEntryValues } from '../types';

/** 実DB signage_master_inspection_types の列（2026-10-15 確認）に合わせたモック */
export function inspectionType(over: Partial<DbInspectionType> & Pick<DbInspectionType, 'id'>): DbInspectionType {
  return {
    inspection_name: `点検${over.id}`,
    template_no: 'elevator_inspection',
    template_image: 'elevator_inspection.png',
    default_text: '',
    category_id: null,
    category: '点検',
    show_on_board: true,
    sort_order: 0,
    created_at: null,
    ...over,
  };
}

export const TYPES: DbInspectionType[] = [
  inspectionType({ id: 'ev', inspection_name: 'エレベーター定期点検', category: '点検', default_text: 'EV停止' }),
  inspectionType({ id: 'clean', inspection_name: '排水管清掃', category: '清掃', template_no: 'cleaning', default_text: '清掃します' }),
  inspectionType({ id: 'work', inspection_name: '外壁工事', category: '工事', template_no: 'construction_outer_wall' }),
  // 実DBに category が null の行がある（名前の部分一致で絞る）
  inspectionType({ id: 'legacy', inspection_name: '消防点検のお知らせ', category: null, template_no: 'fire_inspection' }),
  inspectionType({ id: 'survey', inspection_name: '入居者様アンケート', category: 'アンケート', template_no: 'questionnaire_conducted02' }),
];

export const PROPERTIES: MasterProperty[] = [
  { id: 'p1', property_code: '120273-00', property_name: '端末あり', terminals: [{ terminal_id: 'h0001A00', supplement: 'センター棟' }, { terminal_id: 'h0001A01', supplement: '' }], inspections: [] },
  { id: 'p2', property_code: 'z0015A01', property_name: '未設置', terminals: [], inspections: [] },
  { id: 'p3', property_code: '2010', property_name: '数値コード', terminals: [{ terminal_id: 'z1003A01', supplement: '' }], inspections: [] },
];

export const VENDOR: Pick<DbVendor, 'vendor_name' | 'emergency_contact'> = {
  vendor_name: '三菱電機ﾋﾞﾙｿﾘｭｰｼｮﾝｽﾞ㈱',
  emergency_contact: '0120-000-000',
};

export const SETTINGS: AppSettings = { ...DEFAULT_APP_SETTINGS, display_time_default: 10 };

export function values(over: Partial<SingleEntryValues> = {}): SingleEntryValues {
  return { ...initialValues(SETTINGS, '2026-10-15'), ...over };
}

export function localEntry(over: Partial<LocalEntry> = {}): LocalEntry {
  return {
    _id: 'l1',
    propertyCode: '120273-00',
    propertyName: '端末あり',
    terminalId: 'h0001A01',
    vendorName: VENDOR.vendor_name,
    emergencyContact: VENDOR.emergency_contact ?? '',
    inspectionType: '排水管清掃',
    templateNo: 'cleaning',
    startDate: '2026-10-20',
    endDate: '2026-10-21',
    remarks: '10:00〜12:00',
    noticeText: '前回の案内文',
    frameNo: 3,
    displayStartDate: '2026-10-13',
    displayEndDate: '2026-10-21',
    displayStartTime: '',
    displayEndTime: '',
    displayTime: 8,
    posterType: 'template',
    customImage: null,
    ...over,
  };
}
