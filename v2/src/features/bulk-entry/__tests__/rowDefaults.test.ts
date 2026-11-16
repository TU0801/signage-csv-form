import { describe, it, expect } from 'vitest';
import { buildBulkEntries } from '../utils/buildBulkEntries';
import { generateBulkCsv } from '../utils/bulkCsv';
import { DEFAULT_BULK_SETTINGS } from '../utils/bulkMaster';
import { buildVendorDefaultsIndex } from '@/lib/vendorDefaults';
import type { BulkEntryRow, BulkMasterData } from '../types';

const master: BulkMasterData = {
  properties: [
    { propertyCode: '120409-00', propertyName: '物件A', terminalId: 'T-A1', supplement: '' },
    { propertyCode: '120411-00', propertyName: '物件B', terminalId: 'T-B1', supplement: '' },
  ],
  vendors: [{ id: 'v1', vendorName: '保守A', emergencyContact: '0120-000-001' }],
  notices: [{ id: 't1', inspectionType: 'エレベーター定期点検', templateNo: 'elevator_inspection', noticeText: '' }],
  vendorDefaults: buildVendorDefaultsIndex({
    properties: { '120409-00': 'mc1' },
    overrides: [
      { management_company_id: 'mc1', vendor_id: 'v1', inspection_type_id: null, emergency_contact: '090-1111', template_no: null },
      { management_company_id: 'mc1', vendor_id: 'v1', inspection_type_id: 't1', emergency_contact: null, template_no: 'cleaning' },
    ],
  }),
};

const row = (over: Partial<BulkEntryRow>): BulkEntryRow => ({
  id: 1,
  propertyCode: '120409-00',
  terminalId: 'T-A1',
  vendorName: '保守A',
  inspectionType: 'エレベーター定期点検',
  startDate: '2033-02-05',
  endDate: '2033-02-05',
  remarks: '',
  memo: '',
  displayTime: 6,
  noticeText: '',
  displayStartDate: '',
  displayStartTime: '',
  displayEndDate: '',
  displayEndTime: '',
  showOnBoard: true,
  emergencyContact: '',
  posterType: 'template',
  posterImage: '',
  position: 2,
  isValid: true,
  errors: [],
  ...over,
});

describe('一括入力の申請・CSV に管理会社の個別設定を当てる（修正依頼1115 (5)）', () => {
  it('物件の管理会社の上書きがあれば TPL・緊急連絡先はそれ、無い物件は既定。詳細設定で書いた連絡先は上書きより優先', () => {
    const rows = [row({ id: 1 }), row({ id: 2, propertyCode: '120411-00', terminalId: 'T-B1' }), row({ id: 3, emergencyContact: '080-9999' })];
    const vendor = { id: 'v1', name: '保守A' };
    const built = buildBulkEntries(rows, master, vendor, DEFAULT_BULK_SETTINGS);
    expect(built.map((e) => [e.template_no, e.emergency_contact])).toEqual([
      ['cleaning', '090-1111'],
      ['elevator_inspection', '0120-000-001'],
      ['cleaning', '080-9999'],
    ]);
    // CSV（5列目 緊急連絡先・8列目 TPLNo）も申請と同じ値
    const lines = generateBulkCsv(rows, master, vendor, DEFAULT_BULK_SETTINGS).split('\n').slice(1);
    expect(lines.map((l) => [l.split(',')[7], l.split(',')[4]])).toEqual([
      ['cleaning', '090-1111'],
      ['elevator_inspection', '0120-000-001'],
      ['cleaning', '080-9999'],
    ]);
  });
});
