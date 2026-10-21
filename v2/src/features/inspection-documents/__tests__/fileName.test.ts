import { describe, expect, it } from 'vitest';
import { buildReportFileName, normalizeEditedFileName, sanitizeFileNamePart } from '../lib/fileName';

describe('buildReportFileName', () => {
  it('実施日_建物名_点検種別.pdf（DocFlow と同じ順・区切り）', () => {
    expect(
      buildReportFileName({ performedOn: '2026-10-05', propertyName: 'サンプル マンション', inspectionTypeLabel: 'エレベーター定期点検' }),
    ).toBe('20261005_サンプルマンション_エレベーター定期点検.pdf');
  });

  it('空の項目は既定の語で埋める', () => {
    expect(buildReportFileName({ performedOn: '2026-10-05', propertyName: '', inspectionTypeLabel: '' })).toBe(
      '20261005_未設定_点検.pdf',
    );
  });
});

describe('sanitizeFileNamePart', () => {
  it('禁止文字・空白を除き、全角数字を半角にし、50文字で切る', () => {
    expect(sanitizeFileNamePart('第１棟/Ａ:"館"　 ')).toBe('第1棟Ａ館');
    expect(Array.from(sanitizeFileNamePart('あ'.repeat(60)))).toHaveLength(50);
  });
});

describe('normalizeEditedFileName', () => {
  it('禁止文字を除き .pdf を付ける。空なら空', () => {
    expect(normalizeEditedFileName('a/b:c')).toBe('abc.pdf');
    expect(normalizeEditedFileName('x.PDF')).toBe('x.pdf');
    expect(normalizeEditedFileName(' / ')).toBe('');
  });
});
