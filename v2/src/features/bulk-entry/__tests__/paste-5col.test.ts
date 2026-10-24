import { describe, it, expect } from 'vitest';
import { buildPasteTemplateSheet, parseExcelPaste, PASTE_COLUMNS } from '../utils/parseExcelPaste';
import type { BulkProperty } from '../types';

/** 1024 の新5列（物件名 / 点検種別 / 開始日 / 終了日 / 備考）。旧6列の互換は paste-parity.test.ts */
const properties: BulkProperty[] = [
  { propertyCode: 'z0001A01', propertyName: '物件A', terminalId: 'T-A1', supplement: '' },
  { propertyCode: '120442-00', propertyName: '物件B', terminalId: 'T-B1', supplement: '' },
];

describe('Excel 取込（新5列）', () => {
  it('ヘッダー行つきの5列を見出し名で読み、端末ID は空で渡す（addRow が物件の端末を入れる）', () => {
    const paste = [
      '物件名\t点検種別\t開始日\t終了日\t備考',
      '物件A\tエレベーター定期点検\t2026/11/2\t2026/11/3\t10:00～12:00',
      '120442-00\t消防設備点検\t2026-11-05\t\tNo2号機11:00～12:00',
    ].join('\r\n');
    const { rows, errorCount, unresolvedCount } = parseExcelPaste(paste, properties);
    expect(errorCount).toBe(0);
    expect(unresolvedCount).toBe(0);
    expect(rows).toEqual([
      {
        propertyCode: 'z0001A01',
        terminalId: '',
        inspectionType: 'エレベーター定期点検',
        startDate: '2026-11-02',
        endDate: '2026-11-03',
        remarks: '10:00～12:00',
        noticeText: '',
        position: 2,
      },
      {
        propertyCode: '120442-00',
        terminalId: '',
        inspectionType: '消防設備点検',
        startDate: '2026-11-05',
        endDate: '',
        remarks: 'No2号機11:00～12:00',
        noticeText: '',
        position: 2,
      },
    ]);
  });

  it('ヘッダー行が無くても日付の位置で5列と旧6列を見分ける', () => {
    const five = parseExcelPaste('物件A\t消防設備点検\t2026/11/2\t2026/11/3\t午前', properties).rows[0]!;
    expect(five).toMatchObject({
      propertyCode: 'z0001A01',
      terminalId: '',
      inspectionType: '消防設備点検',
      startDate: '2026-11-02',
      endDate: '2026-11-03',
      remarks: '午前',
    });

    const six = parseExcelPaste('物件A\tT-A1\t消防設備点検\t2026/11/2\t2026/11/3\t午前', properties).rows[0]!;
    expect(six).toMatchObject({
      propertyCode: 'z0001A01',
      terminalId: 'T-A1',
      inspectionType: '消防設備点検',
      startDate: '2026-11-02',
      endDate: '2026-11-03',
      remarks: '午前',
    });

    // 新5列で開始日が空・終了日だけの行は旧6列とみなさず、後の行で5列と決まる
    const mixed = parseExcelPaste('物件A\t消防設備点検\t\t2026/11/3\t\n物件B\t消防設備点検\t2026/11/4\t\t', properties).rows;
    expect(mixed.map((r) => [r.inspectionType, r.startDate, r.endDate])).toEqual([
      ['消防設備点検', '', '2026-11-03'],
      ['消防設備点検', '2026-11-04', ''],
    ]);
  });

  it('旧6列の見出し（端末ID あり）は見出し名で旧6列として読む', () => {
    const { rows } = parseExcelPaste(
      '物件名\t端末ID\t点検種別\t開始日\t終了日\t備考\n物件A\t\t消防設備点検\t2026/1/5\t\t',
      properties,
    );
    expect(rows[0]).toMatchObject({ terminalId: '', inspectionType: '消防設備点検', startDate: '2026-01-05' });
  });

  it('新5列では6・7列目に案内文・表示位置を読む', () => {
    const { rows } = parseExcelPaste('物件A\t消防設備点検\t2026/11/2\t2026/11/2\t\t本日点検します\t4', properties);
    expect(rows[0]).toMatchObject({ remarks: '', noticeText: '本日点検します', position: 4 });
  });

  it('テンプレート書式は5列（端末ID なし・見出しは「備考」のまま）で、備考の例は作業時間', () => {
    const sheet = buildPasteTemplateSheet();
    expect(sheet[0]).toEqual(['物件名', '点検種別', '開始日', '終了日', '備考']);
    expect(sheet[0]).toEqual([...PASTE_COLUMNS]);
    expect(sheet.slice(1).map((r) => r[4])).toEqual(['10:00～12:00', 'No2号機11:00～12:00']);
    // 書式をそのまま貼っても読める（日付は YYYY/M/D）
    const { rows } = parseExcelPaste(sheet.map((r) => r.join('\t')).join('\n'), properties);
    expect(rows.map((r) => [r.inspectionType, r.startDate, r.remarks])).toEqual([
      ['エレベーター定期点検', '2025-01-15', '10:00～12:00'],
      ['消防設備点検', '2025-02-01', 'No2号機11:00～12:00'],
    ]);
  });
});
