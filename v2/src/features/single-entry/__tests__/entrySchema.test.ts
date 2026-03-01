import { describe, it, expect } from 'vitest';
import { entrySchema } from '../schemas/entrySchema';

/** Record型からキーを除外するヘルパー */
function omit<T extends Record<string, unknown>, K extends keyof T>(
  obj: T,
  ...keys: K[]
): Omit<T, K> {
  const result = { ...obj };
  for (const key of keys) {
    delete result[key];
  }
  return result;
}

describe('entrySchema', () => {
  const validData = {
    propertyCode: 'P001',
    terminalId: 'T001',
    vendorName: '保守会社A',
    emergencyContact: '03-1234-5678',
    inspectionType: '消防設備点検',
    templateNo: 'TPL001',
    startDate: '2026-04-01',
    endDate: '2026-04-30',
    displayStartDate: '2026-03-25',
    displayStartTime: '09:00',
    displayEndDate: '2026-04-30',
    displayEndTime: '18:00',
    displayDuration: 10,
    noticeText: '点検のお知らせ',
    remarks: '備考テスト',
    posterType: 'template' as const,
    posterPosition: '4',
    frameNo: '1',
    showOnBoard: true,
  };

  it('should validate correct data', () => {
    const result = entrySchema.safeParse(validData);
    expect(result.success).toBe(true);
  });

  it('should require propertyCode', () => {
    const result = entrySchema.safeParse({ ...validData, propertyCode: '' });
    expect(result.success).toBe(false);
  });

  it('should require terminalId', () => {
    const result = entrySchema.safeParse({ ...validData, terminalId: '' });
    expect(result.success).toBe(false);
  });

  it('should require vendorName', () => {
    const result = entrySchema.safeParse({ ...validData, vendorName: '' });
    expect(result.success).toBe(false);
  });

  it('should require inspectionType', () => {
    const result = entrySchema.safeParse({ ...validData, inspectionType: '' });
    expect(result.success).toBe(false);
  });

  it('should require startDate', () => {
    const result = entrySchema.safeParse({ ...validData, startDate: '' });
    expect(result.success).toBe(false);
  });

  it('should require endDate', () => {
    const result = entrySchema.safeParse({ ...validData, endDate: '' });
    expect(result.success).toBe(false);
  });

  it('should require displayStartDate', () => {
    const result = entrySchema.safeParse({ ...validData, displayStartDate: '' });
    expect(result.success).toBe(false);
  });

  it('should require displayEndDate', () => {
    const result = entrySchema.safeParse({ ...validData, displayEndDate: '' });
    expect(result.success).toBe(false);
  });

  it('should require displayDuration >= 1', () => {
    const result = entrySchema.safeParse({ ...validData, displayDuration: 0 });
    expect(result.success).toBe(false);
  });

  it('should accept displayDuration of 1', () => {
    const result = entrySchema.safeParse({ ...validData, displayDuration: 1 });
    expect(result.success).toBe(true);
  });

  it('should only accept template or custom for posterType', () => {
    const resultTemplate = entrySchema.safeParse({ ...validData, posterType: 'template' });
    expect(resultTemplate.success).toBe(true);

    const resultCustom = entrySchema.safeParse({ ...validData, posterType: 'custom' });
    expect(resultCustom.success).toBe(true);

    const resultInvalid = entrySchema.safeParse({ ...validData, posterType: 'invalid' });
    expect(resultInvalid.success).toBe(false);
  });

  it('should default emergencyContact to empty string', () => {
    const data = omit(validData, 'emergencyContact');
    const result = entrySchema.safeParse(data);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.emergencyContact).toBe('');
    }
  });

  it('should default displayDuration to 10', () => {
    const data = omit(validData, 'displayDuration');
    const result = entrySchema.safeParse(data);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.displayDuration).toBe(10);
    }
  });

  it('should default posterType to template', () => {
    const data = omit(validData, 'posterType');
    const result = entrySchema.safeParse(data);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.posterType).toBe('template');
    }
  });

  it('should default showOnBoard to true', () => {
    const data = omit(validData, 'showOnBoard');
    const result = entrySchema.safeParse(data);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.showOnBoard).toBe(true);
    }
  });

  it('should default posterPosition to 4', () => {
    const data = omit(validData, 'posterPosition');
    const result = entrySchema.safeParse(data);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.posterPosition).toBe('4');
    }
  });

  it('should default frameNo to 1', () => {
    const data = omit(validData, 'frameNo');
    const result = entrySchema.safeParse(data);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.frameNo).toBe('1');
    }
  });
});
