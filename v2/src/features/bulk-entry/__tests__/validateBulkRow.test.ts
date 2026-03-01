import { describe, it, expect } from 'vitest';
import { validateBulkRow } from '../utils/validateBulkRow';
import type { EntryFormData } from '@/types/app';
import { DEFAULT_DISPLAY_DURATION } from '@/lib/constants';

function createValidRow(): EntryFormData {
  return {
    propertyCode: 'P001',
    terminalId: 'T01',
    vendorName: 'ABC保守',
    emergencyContact: '090-1234-5678',
    inspectionType: '電気点検',
    templateNo: 'TPL001',
    startDate: '2025-01-01',
    endDate: '2025-01-31',
    displayStartDate: '2025-01-01',
    displayStartTime: '09:00',
    displayEndDate: '2025-01-31',
    displayEndTime: '18:00',
    displayDuration: DEFAULT_DISPLAY_DURATION,
    noticeText: 'テスト案内',
    remarks: '備考',
    posterType: 'template',
    posterPosition: '',
    frameNo: '',
    showOnBoard: true,
  };
}

describe('validateBulkRow', () => {
  it('returns no errors for a valid row', () => {
    const errors = validateBulkRow(createValidRow());
    expect(Object.keys(errors)).toHaveLength(0);
  });

  it('reports missing required fields', () => {
    const row: EntryFormData = {
      ...createValidRow(),
      propertyCode: '',
      terminalId: '',
      vendorName: '',
      inspectionType: '',
    };
    const errors = validateBulkRow(row);
    expect(errors['propertyCode']).toBeDefined();
    expect(errors['terminalId']).toBeDefined();
    expect(errors['vendorName']).toBeDefined();
    expect(errors['inspectionType']).toBeDefined();
  });

  it('reports missing date fields', () => {
    const row: EntryFormData = {
      ...createValidRow(),
      startDate: '',
      endDate: '',
      displayStartDate: '',
      displayEndDate: '',
    };
    const errors = validateBulkRow(row);
    expect(errors['startDate']).toBeDefined();
    expect(errors['endDate']).toBeDefined();
    expect(errors['displayStartDate']).toBeDefined();
    expect(errors['displayEndDate']).toBeDefined();
  });

  it('reports invalid date format', () => {
    const row: EntryFormData = {
      ...createValidRow(),
      startDate: '2025/01/01',
    };
    const errors = validateBulkRow(row);
    expect(errors['startDate']).toContain('YYYY-MM-DD');
  });

  it('reports endDate before startDate', () => {
    const row: EntryFormData = {
      ...createValidRow(),
      startDate: '2025-02-01',
      endDate: '2025-01-01',
    };
    const errors = validateBulkRow(row);
    expect(errors['endDate']).toContain('開始日以降');
  });

  it('reports displayEndDate before displayStartDate', () => {
    const row: EntryFormData = {
      ...createValidRow(),
      displayStartDate: '2025-02-01',
      displayEndDate: '2025-01-01',
    };
    const errors = validateBulkRow(row);
    expect(errors['displayEndDate']).toContain('表示開始日以降');
  });

  it('reports negative displayDuration', () => {
    const row: EntryFormData = {
      ...createValidRow(),
      displayDuration: -1,
    };
    const errors = validateBulkRow(row);
    expect(errors['displayDuration']).toBeDefined();
  });

  it('accepts zero displayDuration', () => {
    const row: EntryFormData = {
      ...createValidRow(),
      displayDuration: 0,
    };
    const errors = validateBulkRow(row);
    expect(errors['displayDuration']).toBeUndefined();
  });
});
