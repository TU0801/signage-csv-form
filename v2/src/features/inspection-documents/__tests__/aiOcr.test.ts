import { describe, expect, it } from 'vitest';
import {
  documentTypeIsRead,
  buildCorrectionDictionary,
  correctionKey,
  correctionRecord,
  firstDayOfPreviousMonth,
  matchBuildingInText,
  matchBuildingName,
  matchCompany,
  parseDateRange,
  parseJapaneseDate,
  parseTargetMonth,
  postProcessOcr,
  readFromTextLayer,
  suggestBreaks,
  suggestSegmentTargets,
  suggestedDefaultPerformedOn,
  type AiOcrRaw,
} from '../lib/aiOcr';

const properties = [
  { code: 'B0323', name: 'YADO／Re薬院' },
  { code: 'B0100', name: 'エンクレスト天神' },
  { code: 'B0101', name: 'エンクレスト天神MERS' },
  { code: 'B0200', name: 'グランフォーレ博多駅南' },
];

const raw = (patch: Partial<AiOcrRaw> = {}): AiOcrRaw => ({
  document_type: '警備報告書',
  target_month_text: '',
  target_month: '',
  performed_on_text: '',
  performed_on: '',
  vendor_name: '',
  inspection_type: '',
  pages: [],
  ...patch,
});

describe('aiOcr 日付', () => {
  it('和暦・西暦・2桁年と、5桁年・数字に似た文字の OCR 誤りを直して読む', () => {
    expect(parseJapaneseDate('令和8年10月5日')).toBe('2026-10-05');
    expect(parseJapaneseDate('R8.10.5')).toBe('2026-10-05');
    expect(parseJapaneseDate('点検日 ２０２６年１０月５日')).toBe('2026-10-05');
    expect(parseJapaneseDate('20226年1O月5日')).toBe('2026-10-05');
    expect(parseJapaneseDate('26年10月6日')).toBe('2026-10-06');
    expect(parseJapaneseDate('2026年2月30日')).toBeNull();
    expect(parseDateRange('2026年10月1日～31日')).toEqual({ start: '2026-10-01', end: '2026-10-31' });
  });

  it('「2026年10月分」「令和8年10月分」を対象月にする', () => {
    expect(parseTargetMonth('2026年10月分 警備報告書 東洋警備保障')).toBe('2026-10-01');
    expect(parseTargetMonth('令和８年１０月分')).toBe('2026-10-01');
    expect(parseTargetMonth('2026年10月5日')).toBeNull();
  });

  it('実施日の既定: 読めた実施日、読めず対象月が先月なら先月頭（修正依頼1026 K2）、それ以外は変えない', () => {
    expect(suggestedDefaultPerformedOn({ performedOn: '2026-10-03', targetMonth: '2026-09-01' }, '2026-10-25')).toBe('2026-10-03');
    expect(suggestedDefaultPerformedOn({ performedOn: null, targetMonth: '2026-09-01' }, '2026-10-25')).toBe('2026-09-01');
    expect(suggestedDefaultPerformedOn({ performedOn: null, targetMonth: '2026-10-01' }, '2026-10-25')).toBeNull();
    expect(suggestedDefaultPerformedOn({ performedOn: null, targetMonth: null }, '2026-01-10')).toBeNull();
  });

  it('先月の1日（『先月頭』）', () => {
    expect(firstDayOfPreviousMonth('2026-10-25')).toBe('2026-09-01');
    expect(firstDayOfPreviousMonth('2026-03-31')).toBe('2026-02-01');
    expect(firstDayOfPreviousMonth('2026-01-15')).toBe('2025-12-01');
  });

  it('期間の書類は前半の日付を実施日にする（AI が後ろの日付を返しても。修正依頼1026 J4）', () => {
    const ctx = { properties, vendors: [], inspectionTypes: [], dictionary: new Map() };
    const s = postProcessOcr(
      raw({ performed_on_text: '2026年9月1日～2026年9月30日', performed_on: '2026-09-30' }),
      ctx,
    );
    expect(s.performedOn).toBe('2026-09-01');
    expect(postProcessOcr(raw({ performed_on: '2026-09-30' }), ctx).performedOn).toBe('2026-09-30');
  });
});

describe('aiOcr 名前の照合', () => {
  it('建物名は核の一致・あいまい一致で当て、意味のある接尾辞の差（MERS）は別の建物として扱う', () => {
    expect(matchBuildingName('物件名：エンクレスト天神 様', properties)?.code).toBe('B0100');
    expect(matchBuildingName('グランフォーレ博多駅南', properties)?.method).toBe('exact');
    expect(matchBuildingName('グランフオーレ博多駅南', properties)?.code).toBe('B0200');
    expect(matchBuildingName('エンクレスト天神MERS', properties)?.code).toBe('B0101');
    expect(matchBuildingName('まったく別のビル', properties)).toBeNull();
    // 全文からは最長の物件名を当てる（天神 と 天神MERS の両方が含まれる → MERS）
    expect(matchBuildingInText('作業場所 エンクレスト天神MERS 1号機', properties)?.code).toBe('B0101');
  });

  it('会社名は法人格を除いて照合し、候補が1つのときだけ当てる', () => {
    const vendors = [
      { id: 'v1', name: '三菱電機ビルソリューションズ株式会社' },
      { id: 'v2', name: '東洋警備保障株式会社' },
      { id: 'v3', name: '東洋エレベーター株式会社' },
    ];
    expect(matchCompany('㈱東洋警備保障', vendors)?.id).toBe('v2');
    expect(matchCompany('三菱電機ビルソリューションズ(株)', vendors)?.id).toBe('v1');
    expect(matchCompany('東洋', vendors)).toBeNull();
  });
});

describe('aiOcr 自己改善の辞書', () => {
  it('2回以上同じ確定があり割れていない読みだけを、照合より先に当てる', () => {
    const rec = correctionRecord('property', 'ヤド・リ薬院', 'B0100', 'B0323');
    expect(rec?.raw_text).toBe('ヤドリ薬院');
    const dict = buildCorrectionDictionary([
      { field: 'property', raw_text: 'ヤドリ薬院', resolved_value: 'B0323', confirmations: 2, conflicting: false },
      { field: 'property', raw_text: '天神ビル', resolved_value: 'B0100', confirmations: 1, conflicting: false },
      { field: 'property', raw_text: '博多', resolved_value: 'B0200', confirmations: 3, conflicting: true },
    ]);
    const s = postProcessOcr(
      raw({ pages: [{ page: 1, building_name: 'ヤド リ薬院', inspection_type: '', performed_on: '' }] }),
      { properties, vendors: [], inspectionTypes: [], dictionary: dict },
    );
    expect(s.pages[0]?.property).toMatchObject({ code: 'B0323', method: 'dictionary' });
    expect(dict.has('property:天神ビル')).toBe(false);
    expect(dict.has('property:博多')).toBe(false);
  });

  it('区分の辞書は区分の値のときだけ当てる（区分でない値は書類の種類から決める）', () => {
    const key = correctionKey('category', '見積書');
    const ok = buildCorrectionDictionary([{ field: 'category', raw_text: key, resolved_value: 'invoice', confirmations: 2, conflicting: false }]);
    expect(postProcessOcr(raw({ document_type: '見積書' }), { properties, vendors: [], inspectionTypes: [], dictionary: ok }).category).toBe('invoice');
    const bad = buildCorrectionDictionary([{ field: 'category', raw_text: key, resolved_value: 'zzz', confirmations: 2, conflicting: false }]);
    expect(postProcessOcr(raw({ document_type: '見積書' }), { properties, vendors: [], inspectionTypes: [], dictionary: bad }).category).toBe('estimate');
  });
});

describe('aiOcr 区間への割り当て', () => {
  const target = (key: string, code: string, month: string | null, label = '警備報告') => ({
    key,
    targetMonth: month,
    inspection: { property_code: code, inspection_type_label: label, vendor_id: 'v2', unit_vendor_ids: [] },
  });

  it('文字情報だけで読んだときも、抽出データの点検種別にページの文字で当てた点検種別を出す', () => {
    const pageTexts = ['（表紙）', '2026年10月分 警備報告書 エンクレスト天神'];
    const s = postProcessOcr(readFromTextLayer(pageTexts), {
      properties,
      vendors: [],
      inspectionTypes: ['警備報告'],
      dictionary: new Map(),
      pageTexts,
    });
    expect(s.inspectionTypeRead).toBe('');
    expect(s.inspectionType).toBe('警備報告');
  });

  it('文字情報だけで建物・対象月を読み、建物が変わるページで区切って区間ごとに点検を選ぶ', () => {
    const pageTexts = [
      '2026年10月分 警備報告書 エンクレスト天神 東洋警備保障株式会社',
      '（続き）巡回記録',
      '2026年10月分 警備報告書 グランフォーレ博多駅南',
    ];
    const s = postProcessOcr(readFromTextLayer(pageTexts), {
      properties,
      vendors: [{ id: 'v2', name: '東洋警備保障株式会社' }],
      inspectionTypes: ['警備報告'],
      dictionary: new Map(),
      pageTexts,
    });
    expect(s.targetMonth).toBe('2026-10-01');
    expect(s.documentType).toBe('警備報告書');
    expect(s.vendor?.id).toBe('v2');
    expect(s.pages[0]?.inspectionType).toBe('警備報告');
    const breaks = suggestBreaks(s.pages, 3);
    expect([...breaks]).toEqual([2]);
    const picks = suggestSegmentTargets(
      [
        { start: 0, end: 1 },
        { start: 2, end: 2 },
      ],
      s,
      [
        target('a-09', 'B0100', '2026-09-01'),
        target('a-10', 'B0100', '2026-10-01'),
        target('b-10', 'B0200', '2026-10-01'),
        target('b-11', 'B0200', '2026-11-01'),
      ],
    );
    expect(picks).toEqual({ 0: 'a-10', 2: 'b-10' });
  });
});

describe('documentTypeIsRead（区分の学習記録は書類の種類が読めたときだけ）', () => {
  it('空と「その他」は読めていない扱い、見積書などは読めた扱い', () => {
    expect(documentTypeIsRead('')).toBe(false);
    expect(documentTypeIsRead('その他')).toBe(false);
    expect(documentTypeIsRead('見積書')).toBe(true);
  });
});
