import { describe, it, expect } from 'vitest';
import {
  buildVendorDefaultsIndex,
  effectiveVendorDefaults,
  overrideAction,
  resolveEntryDefaults,
  type MgmtVendorDefaultRow,
} from '../vendorDefaults';

const index = buildVendorDefaultsIndex({
  properties: { '120409-00': 'mc1', '120411-00': 'mc2' },
  overrides: [
    { management_company_id: 'mc1', vendor_id: 'v1', inspection_type_id: null, emergency_contact: '090-1111', template_no: null },
    { management_company_id: 'mc1', vendor_id: 'v1', inspection_type_id: 't1', emergency_contact: null, template_no: 'cleaning' },
    { management_company_id: 'mc2', vendor_id: 'v1', inspection_type_id: 't1', emergency_contact: null, template_no: 'fire_inspection' },
  ],
});
const base = { templateNo: 'elevator_inspection', emergencyContact: '0120-000-001' };

describe('resolveEntryDefaults（修正依頼1115 (5)）', () => {
  it('物件の管理会社 × 受注先 × 点検種別の上書きがあれば TPL・緊急連絡先をそれにする（物件コードの -00 は揺れを吸収）', () => {
    expect(resolveEntryDefaults(index, { propertyCode: '120409', vendorId: 'v1', inspectionTypeId: 't1' }, base)).toEqual({
      templateNo: 'cleaning',
      emergencyContact: '090-1111',
      templateOverridden: true,
      contactOverridden: true,
    });
    // 管理会社が違う物件は、その管理会社の上書き（緊急連絡先の上書きは無いので既定）
    expect(resolveEntryDefaults(index, { propertyCode: '120411-00', vendorId: 'v1', inspectionTypeId: 't1' }, base)).toMatchObject({
      templateNo: 'fire_inspection',
      emergencyContact: '0120-000-001',
      contactOverridden: false,
    });
  });

  it('上書きが無い・別の保守会社・別の種別・読めていないときは既定のまま', () => {
    const plain = { ...base, templateOverridden: false, contactOverridden: false };
    expect(resolveEntryDefaults(index, { propertyCode: '120409-00', vendorId: 'v2', inspectionTypeId: 't1' }, base)).toEqual(plain);
    expect(resolveEntryDefaults(index, { propertyCode: '999999-00', vendorId: 'v1', inspectionTypeId: 't1' }, base)).toEqual(plain);
    expect(resolveEntryDefaults(null, { propertyCode: '120409-00', vendorId: 'v1', inspectionTypeId: 't1' }, base)).toEqual(plain);
    // 種別が違えば TPL は既定、緊急連絡先（保守会社単位）は上書き
    expect(resolveEntryDefaults(index, { propertyCode: '120409-00', vendorId: 'v1', inspectionTypeId: 't9' }, base)).toEqual({
      ...plain,
      emergencyContact: '090-1111',
      contactOverridden: true,
    });
  });
});

describe('保守会社タブの表示と保存の判定', () => {
  const row: MgmtVendorDefaultRow = {
    vendor_id: 'v1',
    vendor_name: '保守A',
    default_emergency_contact: '0120-000-001',
    inspection_type_id: 't1',
    inspection_type_label: 'エレベーター定期点検',
    default_template_no: 'elevator_inspection',
    contact_override_id: null,
    emergency_contact: null,
    template_override_id: 'o1',
    template_no: 'cleaning',
    updated_at: null,
  };

  it('上書きがあれば上書き・印あり、無ければ既定', () => {
    expect(effectiveVendorDefaults(row)).toEqual({
      emergencyContact: '0120-000-001',
      templateNo: 'cleaning',
      contactOverridden: false,
      templateOverridden: true,
    });
  });

  it('空か既定と同じなら上書きを消し（無ければ何もしない）、違う値なら登録する', () => {
    expect(overrideAction('', 'elevator_inspection', 'cleaning')).toEqual({ kind: 'clear' });
    expect(overrideAction('elevator_inspection', 'elevator_inspection', 'cleaning')).toEqual({ kind: 'clear' });
    expect(overrideAction(' ', '0120', null)).toEqual({ kind: 'keep' });
    expect(overrideAction('cleaning', 'elevator_inspection', 'cleaning')).toEqual({ kind: 'keep' });
    expect(overrideAction(' 090-2222 ', '0120', null)).toEqual({ kind: 'set', value: '090-2222' });
  });
});
