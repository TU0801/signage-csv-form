import { describe, expect, it } from 'vitest';
import { makeInspection } from '@/features/inspection-portal/__tests__/fixtures';
import {
  AMBIGUOUS_VENDOR_MESSAGE,
  makeRowVendorOf,
  NO_INSPECTION_MESSAGE,
  VENDOR_UNREGISTERED_MESSAGE,
} from '../utils/rowVendor';
import { generateBulkCsv } from '../utils/bulkCsv';
import { DEFAULT_BULK_SETTINGS } from '../utils/bulkMaster';
import type { BulkEntryRow, BulkMasterData } from '../types';
import type { PortalUnitRow } from '@/types/portal';

const vendors = [
  { id: 'v1', vendorName: 'A社', emergencyContact: '092-000-0000' },
  { id: 'v2', vendorName: 'B社', emergencyContact: '' },
];
const links = [
  makeInspection({
    inspection_id: 'i1',
    property_code: '900001-00',
    inspection_type_label: '消防設備点検',
    vendor_id: 'v1',
  }),
  makeInspection({
    inspection_id: 'i2',
    property_code: '900002-00',
    inspection_type_label: '消防設備点検',
    vendor_id: null,
  }),
  makeInspection({
    inspection_id: 'i3',
    property_code: '900003-00',
    inspection_type_label: '消防設備点検',
    vendor_id: 'v1',
  }),
  makeInspection({
    inspection_id: 'i4',
    property_code: '900003-00',
    inspection_type_label: '消防設備点検',
    vendor_id: 'v2',
  }),
];
const unit = { unit_id: 'u2', maintainer_id: 'v2' } as PortalUnitRow;
const items = new Map([
  ['i1:2026-11-01', { inspection: links[0]!, unit: undefined }],
  ['i1:2026-11-01:u2', { inspection: links[0]!, unit }],
]);
const vendorOf = makeRowVendorOf({
  vendors,
  itemOf: (row) => (row.schedule ? items.get(row.schedule.key) : undefined),
  links,
});
const row = (over: Partial<BulkEntryRow>): BulkEntryRow =>
  ({
    propertyCode: '',
    inspectionType: '消防設備点検',
    startDate: '2026-11-10',
    vendorName: '',
    emergencyContact: '',
    isValid: true,
    errors: [],
    ...over,
  }) as BulkEntryRow;
const schedule = (key: string) => ({
  key,
  inspectionId: 'i1',
  targetMonth: '2026-11-01',
  locked: false,
  propertyName: '',
  terminalIds: [],
});

describe('行ごとの保守会社（管理会社の一括入力。修正依頼1115 (2)）', () => {
  it('予定の行は点検行、台の行は台の保守会社。手の行は当たった点検行の保守会社', () => {
    expect(vendorOf(row({ schedule: schedule('i1:2026-11-01') }))).toMatchObject({
      id: 'v1',
      name: 'A社',
      emergencyContact: '092-000-0000',
    });
    expect(vendorOf(row({ schedule: schedule('i1:2026-11-01:u2') }))).toMatchObject({
      id: 'v2',
      name: 'B社',
    });
    expect(vendorOf(row({ propertyCode: '900001-00' }))).toMatchObject({
      id: 'v1',
      name: 'A社',
      inspectionId: 'i1',
    });
  });

  it('保守会社が未登録・点検に当たらない・複数の保守会社に当たる行は理由を返す', () => {
    expect(vendorOf(row({ propertyCode: '900002-00' })).reason).toBe(VENDOR_UNREGISTERED_MESSAGE);
    expect(vendorOf(row({ propertyCode: '900001-00', startDate: '2026-12-10' })).reason).toBe(
      NO_INSPECTION_MESSAGE,
    );
    expect(vendorOf(row({ propertyCode: '900003-00' })).reason).toBe(AMBIGUOUS_VENDOR_MESSAGE);
  });

  it('CSV の受注先名・緊急連絡先は行の保守会社から（渡さなければ今までどおり行の vendorName）', () => {
    const master: BulkMasterData = { properties: [], vendors, notices: [] };
    const rows = [
      row({ propertyCode: '900001-00', terminalId: 'T1' }),
      row({ schedule: schedule('i1:2026-11-01:u2'), propertyCode: '900001-00', terminalId: 'T1' }),
    ];
    const cols = (csv: string) =>
      csv
        .split('\n')
        .slice(1)
        .map((l) => l.split(',').slice(3, 5));
    expect(
      cols(
        generateBulkCsv(rows, master, { id: null, name: null }, DEFAULT_BULK_SETTINGS, vendorOf),
      ),
    ).toEqual([
      ['A社', '092-000-0000'],
      ['B社', ''],
    ]);
    expect(
      cols(generateBulkCsv(rows, master, { id: 'v1', name: 'A社' }, DEFAULT_BULK_SETTINGS)),
    ).toEqual([
      ['', '092-000-0000'],
      ['', '092-000-0000'],
    ]);
  });
});
