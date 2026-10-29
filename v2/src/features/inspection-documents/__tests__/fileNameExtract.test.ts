import { describe, expect, it } from 'vitest';
import {
  categoryFromFileName,
  dateFromFileName,
  extractFromFileName,
  type FileNameContext,
} from '../lib/fileNameExtract';

const ctx: FileNameContext = {
  properties: [
    { code: '120409-00', name: 'エンクレスト六本松Ⅱ', aliases: ['エンクレスト六本松2', '六本松Ⅱ'], managementCompanyId: 'm1' },
    { code: '120410-00', name: 'エンクレストガーデン福岡', aliases: [], managementCompanyId: 'm2' },
  ],
  vendors: [{ id: 'v1', name: '三菱電機ビルソリューションズ株式会社', shortName: '三菱電機BS' }],
  managementCompanies: [{ id: 'm2', name: '株式会社えん建物管理', shortName: 'えん建物' }],
  inspectionTypes: ['エレベーター定期点検', 'デジタルサイネージ点検'],
};

describe('fileNameExtract（修正依頼1029(1) ファイル名からの自動入力）', () => {
  it('区分は変換表で決める（見積・請求が報告・点検より先）', () => {
    expect(categoryFromFileName('御見積_エンクレスト.pdf')).toBe('estimate');
    expect(categoryFromFileName('点検見積書.pdf')).toBe('estimate');
    expect(categoryFromFileName('2026年10月分請求.xlsx')).toBe('invoice');
    expect(categoryFromFileName('20261025_定期点検.pdf')).toBe('report');
    expect(categoryFromFileName('IMG_0001.MOV')).toBe('photo');
    expect(categoryFromFileName('資料.docx')).toBeNull();
  });

  it('日付はファイル名の 8桁・区切り・和暦から取る', () => {
    expect(dateFromFileName('20251126_白金1丁目.pdf')).toBe('2025-11-26');
    expect(dateFromFileName('報告 2026-10-25.pdf')).toBe('2026-10-25');
    expect(dateFromFileName('報告_2026_10_5.pdf')).toBe('2026-10-05');
    expect(dateFromFileName('R8.10.25 点検.pdf')).toBe('2026-10-25');
    expect(dateFromFileName('令和8年10月25日.pdf')).toBe('2026-10-25');
    expect(dateFromFileName('物件120409001_報告.pdf')).toBeNull();
    expect(dateFromFileName('20261399.pdf')).toBeNull();
  });

  it('物件・取引先・点検種別はファイル名に含まれる名前・略称で当て、日付が無ければ更新日（日本時間）', () => {
    // 2026-10-20T16:00Z は日本時間 10/21
    const got = extractFromFileName(
      { name: '三菱電機BS_エンクレスト六本松2_エレベーター定期点検報告書.pdf', lastModified: Date.parse('2026-10-20T16:00:00Z') },
      ctx,
    );
    expect(got).toEqual({
      category: 'report',
      propertyCode: '120409-00',
      vendorId: 'v1',
      managementCompanyId: 'm1',
      inspectionType: 'エレベーター定期点検',
      performedOn: '2026-10-21',
      performedOnSource: 'mtime',
    });
  });
});
