import { describe, it, expect } from 'vitest';
import JSZip from 'jszip';
import * as XLSX from 'xlsx';
import { buildTemplateRows, buildTemplateXlsx, templateFilename } from '../utils/bulkTemplateXlsx';
import { excelFileToTsv, parseExcelPaste } from '../utils/parseExcelPaste';
import type { BulkProperty } from '../types';

/** 一括入力テンプレート（修正依頼1027 (2)） */
const inspections = [
  { inspection_id: 'a-fire', property_code: 'z0001A01', property_name: '物件A', inspection_type_label: '消防設備点検' },
  { inspection_id: 'a-ev', property_code: 'z0001A01', property_name: '物件A', inspection_type_label: 'エレベーター定期点検' },
  { inspection_id: 'b-ev', property_code: 'z0002A01', property_name: '物件B', inspection_type_label: 'エレベーター定期点検' },
];

describe('一括入力テンプレート', () => {
  it('物件ごとに1行、点検種別は設備の並び（先頭が既定）。ファイル名は 日付_略称_一括点検日入力テンプレート.xlsx', () => {
    // 設備の並びは エレベーター → 消防（名前の順とは逆）
    expect(buildTemplateRows(inspections, ['a-ev', 'a-fire', 'b-ev'])).toEqual([
      { propertyName: '物件A', types: ['エレベーター定期点検', '消防設備点検'] },
      { propertyName: '物件B', types: ['エレベーター定期点検'] },
    ]);
    expect(templateFilename('三菱電機ﾋﾞﾙｿﾘｭｰｼｮﾝｽﾞ㈱', '2026-10-27')).toBe(
      '20261027_三菱電機ﾋﾞﾙｿﾘｭｰｼｮﾝｽﾞ㈱_一括点検日入力テンプレート.xlsx',
    );
  });

  it('見本の行は無く、見出しはグレー地に白文字・罫線、開始日〜備考は薄いグレー、点検種別が2つ以上の行はプルダウン', async () => {
    const rows = buildTemplateRows(inspections, ['a-ev', 'a-fire', 'b-ev']);
    const zip = await JSZip.loadAsync(await buildTemplateXlsx(rows));
    const sheet = await zip.file('xl/worksheets/sheet1.xml')!.async('string');
    const styles = await zip.file('xl/styles.xml')!.async('string');
    // 見出し1行＋物件2行だけ（見本の行なし）
    expect(sheet.match(/<row /g)).toHaveLength(3);
    expect(sheet).not.toContain('アソシア');
    // 見出しは s=1（グレー地 808080・白文字・罫線）
    expect(sheet).toContain('<c r="A1" s="1" t="inlineStr">');
    expect(styles).toContain('<fgColor rgb="FF808080"/>');
    expect(styles).toContain('<color rgb="FFFFFFFF"/>');
    expect(styles).toMatch(/<left style="thin">/);
    // 開始日・終了日（s=3）・備考（s=4）は薄いグレー
    expect(sheet).toContain('<c r="C2" s="3"/><c r="D2" s="3"/><c r="E2" s="4"/>');
    expect(styles).toContain('<fgColor rgb="FFEDEDED"/>');
    // 物件A の点検種別は既定がエレベーター、プルダウンは隠しシートの1行目。物件B（1つだけ）はプルダウンなし
    expect(sheet).toContain('エレベーター定期点検');
    expect(sheet).toContain(`sqref="B2"><formula1>'点検種別の選択肢'!$A$1:$B$1</formula1>`);
    expect(sheet).not.toContain('sqref="B3"');
    const workbook = await zip.file('xl/workbook.xml')!.async('string');
    expect(workbook).toContain('state="hidden"');
  });

  it('Excel取込がテンプレートを読める（日付を入れた行だけ。2行の備考もずれない）', async () => {
    const rows = buildTemplateRows(inspections, ['a-ev', 'a-fire', 'b-ev']);
    // テンプレートを開き、物件B の行に日付（日付のセル）と2行の備考を入れて保存したもの
    const wb = XLSX.read(await buildTemplateXlsx(rows), { type: 'array', cellNF: true });
    const ws = wb.Sheets[wb.SheetNames[0]!]!;
    ws['C3'] = { t: 'n', v: 46335, z: 'yyyy/m/d' }; // 2026/11/9
    ws['D3'] = { t: 'n', v: 46336, z: 'm/d' }; // 2026/11/10（表示の書式が違っても読む）
    ws['E3'] = { t: 's', v: 'No1号機 9:00～\n"午後"も作業' };
    const saved = XLSX.write(wb, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer;

    const properties: BulkProperty[] = [
      { propertyCode: 'z0001A01', propertyName: '物件A', terminalId: 'T-A1', supplement: '' },
      { propertyCode: 'z0002A01', propertyName: '物件B', terminalId: 'T-B1', supplement: '' },
    ];
    const result = parseExcelPaste(await excelFileToTsv(saved), properties);
    expect(result.blankCount).toBe(1);
    expect(result.rows).toHaveLength(1);
    expect(result.rows[0]).toMatchObject({
      propertyCode: 'z0002A01',
      inspectionType: 'エレベーター定期点検',
      startDate: '2026-11-09',
      endDate: '2026-11-10',
      remarks: 'No1号機 9:00～\n"午後"も作業',
    });
  });
});
