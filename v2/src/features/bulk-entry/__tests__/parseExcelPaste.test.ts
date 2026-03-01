import { describe, it, expect } from 'vitest';
import { parseExcelPaste } from '../utils/parseExcelPaste';

describe('parseExcelPaste', () => {
  it('returns empty array for empty input', () => {
    expect(parseExcelPaste('')).toEqual([]);
    expect(parseExcelPaste('  ')).toEqual([]);
  });

  it('parses TSV data without header using default column order', () => {
    const tsv = 'P001\tT01\tABC保守\t電気点検\t2025-01-01\t2025-01-31\t2025-01-01\t2025-01-31\t備考テスト';
    const result = parseExcelPaste(tsv);
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      propertyCode: 'P001',
      terminalId: 'T01',
      vendorName: 'ABC保守',
      inspectionType: '電気点検',
      startDate: '2025-01-01',
      endDate: '2025-01-31',
      displayStartDate: '2025-01-01',
      displayEndDate: '2025-01-31',
      remarks: '備考テスト',
    });
  });

  it('parses TSV with header row', () => {
    const tsv = [
      '物件コード\t端末ID\t保守会社名\t点検種別\t開始日\t終了日',
      'P001\tT01\tABC保守\t電気点検\t2025-01-01\t2025-01-31',
      'P002\tT02\tXYZ保守\tエレベータ点検\t2025-02-01\t2025-02-28',
    ].join('\n');

    const result = parseExcelPaste(tsv);
    expect(result).toHaveLength(2);
    expect(result[0]).toMatchObject({
      propertyCode: 'P001',
      terminalId: 'T01',
      vendorName: 'ABC保守',
      inspectionType: '電気点検',
    });
    expect(result[1]).toMatchObject({
      propertyCode: 'P002',
      vendorName: 'XYZ保守',
    });
  });

  it('parses multiple rows without header', () => {
    const tsv = [
      'P001\tT01\tABC保守\t電気点検\t2025-01-01\t2025-01-31\t2025-01-01\t2025-01-31',
      'P002\tT02\tXYZ保守\tEV点検\t2025-02-01\t2025-02-28\t2025-02-01\t2025-02-28',
    ].join('\n');

    const result = parseExcelPaste(tsv);
    expect(result).toHaveLength(2);
  });

  it('normalizes YYYY/MM/DD dates to YYYY-MM-DD', () => {
    const tsv = '物件コード\t開始日\t終了日\nP001\t2025/01/01\t2025/01/31';
    const result = parseExcelPaste(tsv);
    expect(result).toHaveLength(1);
    expect(result[0]?.startDate).toBe('2025-01-01');
    expect(result[0]?.endDate).toBe('2025-01-31');
  });

  it('skips empty lines', () => {
    const tsv = 'P001\tT01\tABC\t点検\t2025-01-01\t2025-01-31\t2025-01-01\t2025-01-31\n\nP002\tT02\tXYZ\t点検2\t2025-02-01\t2025-02-28\t2025-02-01\t2025-02-28';
    const result = parseExcelPaste(tsv);
    expect(result).toHaveLength(2);
  });

  it('handles Windows-style line endings', () => {
    const tsv = 'P001\tT01\tABC\t点検\t2025-01-01\t2025-01-31\t2025-01-01\t2025-01-31\r\nP002\tT02\tXYZ\t点検2\t2025-02-01\t2025-02-28\t2025-02-01\t2025-02-28';
    const result = parseExcelPaste(tsv);
    expect(result).toHaveLength(2);
  });

  it('fills default values for missing fields', () => {
    const tsv = 'P001\tT01';
    const result = parseExcelPaste(tsv);
    expect(result).toHaveLength(1);
    expect(result[0]?.posterType).toBe('template');
    expect(result[0]?.showOnBoard).toBe(true);
  });
});
