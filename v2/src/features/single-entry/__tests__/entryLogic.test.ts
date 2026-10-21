import { describe, it, expect, vi } from 'vitest';
import {
  applyCategoryChange,
  applyInspectionType,
  applyLinkedDefaults,
  applyPropertyChange,
  applyStartDateChange,
  applyEndDateChange,
  applyVendorCleared,
  buildLocalEntry,
  buildManagementCompanyIndex,
  buildPropertyOptions,
  computePosterSize,
  filterByManagementCompany,
  duplicateValues,
  filterInspectionTypes,
  formatPosterDate,
  remarksUsage,
  submittedStatusLabel,
  toInsertRow,
  valuesFromEntry,
  type EntryContext,
} from '../lib/entryLogic';
import { PROPERTIES, SETTINGS, TYPES, VENDOR, localEntry, values } from './fixtures';

vi.mock('@/lib/supabase', () => ({ supabase: {}, TABLES: {} }));

const NO_LINKS: ReadonlySet<string> = new Set();

function ctx(over: Partial<EntryContext> = {}): EntryContext {
  return {
    properties: PROPERTIES,
    inspectionTypes: TYPES,
    vendor: VENDOR,
    customImage: null,
    hasTemplateImage: () => true,
    settings: SETTINGS,
    ...over,
  };
}

describe('物件の選択肢（v1 populatePropertySelect）', () => {
  it('数値昇順（数値にならなければ文字列順）で、既定 OFF なら未設置物件も出し、ON なら端末のある物件だけ', () => {
    expect(buildPropertyOptions(PROPERTIES, false)).toEqual([
      { value: '2010', label: '2010 数値コード' },
      { value: '120273-00', label: '120273-00 端末あり' },
      { value: 'z0015A01', label: 'z0015A01 未設置', hint: '端末なし' },
    ]);
    expect(buildPropertyOptions(PROPERTIES, true).map((o) => o.value)).toEqual(['2010', '120273-00']);
  });
});

describe('管理会社フィルター', () => {
  it('全て・会社・未設定（業務システムに無い物件を含む）で絞り、選択肢は社名順', () => {
    const index = buildManagementCompanyIndex([
      { property_code: '120273-00', management_company_id: 'c-haseko', management_company_name: '株式会社長谷工コミュニティ九州' },
      { property_code: '2010', management_company_id: 'c-en', management_company_name: '株式会社えん建物管理' },
    ]);
    expect(index.companies.map((c) => c.id)).toEqual(['c-en', 'c-haseko']);
    const codes = (id: string) => filterByManagementCompany(PROPERTIES, index, id).map((p) => p.property_code);
    expect(codes('')).toEqual(['120273-00', 'z0015A01', '2010']);
    expect(codes('c-en')).toEqual(['2010']);
    expect(codes('__none__')).toEqual(['z0015A01']);
  });
});

describe('端末は任意（v1 8f7c1f6 / onPropertyChange）', () => {
  it('端末のある物件は先頭の端末を選び、未設置物件は空にする', () => {
    expect(applyPropertyChange(values(), '120273-00', PROPERTIES).terminalId).toBe('h0001A00');
    expect(applyPropertyChange(values({ terminalId: 'x' }), 'z0015A01', PROPERTIES).terminalId).toBe('');
  });
});

describe('点検工事案内の絞り込み（v1 7ac9214）', () => {
  it('カテゴリは実カテゴリ列で完全一致、列が空の項目は名前の部分一致。紐付けを上に並べる', () => {
    expect(filterInspectionTypes(TYPES, '点検', NO_LINKS).map((t) => t.id)).toEqual(['ev', 'legacy']);
    expect(filterInspectionTypes(TYPES, '', new Set(['work', 'survey'])).map((t) => t.id)).toEqual([
      'work',
      'survey',
      'ev',
      'clean',
      'legacy',
    ]);
  });

  it('紐付けが1カテゴリだけならそのカテゴリと先頭の紐付けを選び、案内文を差し替える', () => {
    const v = applyLinkedDefaults(values(), TYPES, new Set(['clean']));
    expect(v).toMatchObject({ category: '清掃', inspectionTypeId: 'clean', noticeText: '清掃します', templateNo: 'cleaning' });
  });

  it('紐付けに未分類が混じればカテゴリは「全て」のまま、今の選択が残っていれば保つ', () => {
    const v = applyLinkedDefaults(values({ inspectionTypeId: 'ev' }), TYPES, new Set(['clean', 'legacy']));
    expect(v).toMatchObject({ category: '', inspectionTypeId: 'ev', noticeText: 'EV停止' });
  });

  it('手で書き換えた案内文は、点検種別が変わらなければ残し、変われば新しい既定文に差し替える', () => {
    const edited = values({ inspectionTypeId: 'ev', noticeText: '書き換えた文' });
    // カテゴリを変えても今の種別が残るとき・同じ種別を選び直したときは残す
    expect(applyCategoryChange(edited, '', TYPES, NO_LINKS).noticeText).toBe('書き換えた文');
    expect(applyInspectionType(edited, 'ev', TYPES).noticeText).toBe('書き換えた文');
    // 種別を変えたら、前の種別向けに書いた文は残さない
    expect(applyInspectionType(edited, 'clean', TYPES)).toMatchObject({ inspectionTypeId: 'clean', noticeText: '清掃します', templateNo: 'cleaning' });
    expect(applyInspectionType(values({ inspectionTypeId: 'ev', noticeText: 'EV停止' }), 'clean', TYPES).noticeText).toBe('清掃します');
    // 保守会社を外して点検種別が未選択になったあとは、残っている文を新しい既定文に差し替える
    expect(applyInspectionType(values({ inspectionTypeId: '', noticeText: 'EV停止' }), 'clean', TYPES).noticeText).toBe('清掃します');
  });

  it('管理者が保守会社の選択を外すとカテゴリ・点検種別を空に戻す（v1 1761930）', () => {
    const v = applyVendorCleared(values({ category: '清掃', inspectionTypeId: 'clean', templateNo: 'cleaning' }));
    expect(v).toMatchObject({ category: '', inspectionTypeId: '', templateNo: '' });
  });
});

describe('案内文・備考の文字数と行数の表示', () => {
  it('行数と1行の最長文字数を数え、設定の上限を超えたら over', () => {
    expect(remarksUsage('', SETTINGS)).toMatchObject({ lines: 0, longest: 0, over: false });
    expect(remarksUsage('ab\nabcd', SETTINGS)).toMatchObject({ lines: 2, longest: 4, maxLines: 5, perLine: 25, over: false });
    expect(remarksUsage('x'.repeat(26), SETTINGS).over).toBe(true);
  });
});

describe('点検日の連動（v1 init の change）', () => {
  it('開始日は表示開始日に追従し、終了日が空なら終了日・表示終了日も埋める。終了日は表示終了日に追従', () => {
    const v = applyStartDateChange(values({ endDate: '' }), '2026-10-20');
    expect(v).toMatchObject({ startDate: '2026-10-20', displayStartDate: '2026-10-20', endDate: '2026-10-20', displayEndDate: '2026-10-20' });
    const w = applyStartDateChange(values({ endDate: '2026-10-25', displayEndDate: '2026-10-25' }), '2026-10-20');
    expect(w).toMatchObject({ endDate: '2026-10-25', displayEndDate: '2026-10-25' });
    expect(applyEndDateChange(w, '2026-10-26').displayEndDate).toBe('2026-10-26');
  });
});

describe('データを追加（v1 addEntry）', () => {
  const ok = values({ propertyCode: 'z0015A01', inspectionTypeId: 'ev', templateNo: 'elevator_inspection' });

  it('v1 と同じ順番・文言で止める', () => {
    expect(buildLocalEntry(values({ ...ok, startDate: '2026-10-20', endDate: '2026-10-19' }), ctx())).toEqual({
      ok: false,
      message: '終了日は開始日より後にしてください',
    });
    expect(buildLocalEntry(values(), ctx())).toEqual({ ok: false, message: '物件コードを選択してください' });
    expect(buildLocalEntry(ok, ctx({ vendor: null }))).toEqual({ ok: false, message: '保守会社を選択してください' });
    expect(buildLocalEntry(values({ ...ok, inspectionTypeId: '' }), ctx())).toEqual({
      ok: false,
      message: '点検工事案内を選択してください',
    });
    expect(buildLocalEntry(ok, ctx({ hasTemplateImage: () => false }))).toEqual({
      ok: false,
      message: '選択された点検種別のテンプレート画像が見つかりません',
    });
    expect(buildLocalEntry(values({ ...ok, posterType: 'custom' }), ctx())).toEqual({
      ok: false,
      message: '貼紙画像を選択してください',
    });
  });

  it('設定値による検査はまとめて改行区切りで出す', () => {
    const r = buildLocalEntry(
      values({ ...ok, displayTime: '31', remarks: 'a\nb\nc\nd\ne\nf', noticeText: 'x'.repeat(201) }),
      ctx(),
    );
    expect(r).toEqual({
      ok: false,
      message: '表示時間は30秒以下にしてください\n掲示備考は5行以下にしてください\n案内文は200文字以下にしてください',
      settingsTab: true,
    });
  });

  it('未設置物件でも追加でき、追加画像は点検種別「追加画像」・TPLNo はファイル名になる', () => {
    const file = new File(['x'], 'poster.png', { type: 'image/png' });
    const tpl = buildLocalEntry(ok, ctx());
    expect(tpl.ok && tpl.entry).toMatchObject({ terminalId: '', propertyCode: 'z0015A01', propertyName: '未設置', inspectionType: 'エレベーター定期点検', vendorName: VENDOR.vendor_name, displayTime: 10 });
    const custom = buildLocalEntry(values({ ...ok, posterType: 'custom' }), ctx({ customImage: { file, dataUrl: 'data:' } }));
    expect(custom.ok && custom.entry).toMatchObject({ inspectionType: '追加画像', templateNo: 'poster.png', posterType: 'custom' });
  });
});

describe('申請する行（v1 submitEntries）', () => {
  it('v1 と同じ既定値で組み立て、frame_no は送らない', () => {
    const row = toInsertRow(
      localEntry({ displayStartDate: '', displayEndDate: '', displayTime: 0, terminalId: '', remarks: '', noticeText: '' }),
      null,
      'user-1',
      SETTINGS,
      '2026-10-15',
    );
    expect(row).toEqual({
      user_id: 'user-1',
      property_code: '120273-00',
      terminal_id: '',
      vendor_name: VENDOR.vendor_name,
      emergency_contact: VENDOR.emergency_contact,
      inspection_type: '排水管清掃',
      template_no: 'cleaning',
      inspection_start: '2026-10-20',
      inspection_end: '2026-10-21',
      remarks: '',
      announcement: '',
      display_start_date: '2026-10-15',
      display_start_time: null,
      display_end_date: '2026-10-21',
      display_end_time: null,
      display_duration: 10,
      poster_type: 'template',
      poster_image: null,
      poster_position: '3',
      status: 'draft',
    });
    expect(row).not.toHaveProperty('frame_no');
  });
});

describe('前回を複製・編集（v1 duplicateLastEntry / editEntry）', () => {
  it('複製は物件・端末・点検種別・案内文・点検日・備考・表示時間だけ写す', () => {
    const v = duplicateValues(values({ category: '点検', frameNo: 1, displayStartDate: '2026-10-15' }), localEntry(), {
      properties: PROPERTIES,
      inspectionTypes: TYPES,
      linkedIds: NO_LINKS,
      settings: SETTINGS,
    });
    expect(v).toMatchObject({
      propertyCode: '120273-00',
      terminalId: 'h0001A01',
      category: '',
      inspectionTypeId: 'clean',
      templateNo: 'cleaning',
      noticeText: '前回の案内文',
      startDate: '2026-10-20',
      endDate: '2026-10-21',
      remarks: '10:00〜12:00',
      displayTime: '8',
      frameNo: 1,
      displayStartDate: '2026-10-15',
      posterType: 'template',
    });
  });

  it('編集は貼紙区分・位置も戻し、点検種別が今のカテゴリに無ければカテゴリを「全て」にする', () => {
    const v = valuesFromEntry(values({ category: '点検' }), localEntry({ posterType: 'custom' }), TYPES, NO_LINKS);
    expect(v).toMatchObject({ category: '', inspectionTypeId: 'clean', posterType: 'custom', frameNo: 3, displayTime: '8' });
  });
});

describe('張紙プレビュー（v1 updatePreview）', () => {
  it('日付は「M月D日(曜)」、終了日が違えば「〜」でつなぐ', () => {
    expect(formatPosterDate('2026-10-15', '2026-10-15')).toBe('10月15日(木)');
    expect(formatPosterDate('2026-10-15', '2026-10-16')).toBe('10月15日(木)〜10月16日(金)');
    expect(formatPosterDate('', '2026-10-16')).toBe('');
  });

  it('枠は縦横比を保ち、幅は親の幅、高さは上限まで（v1 4737efb の fitContainer）', () => {
    expect(computePosterSize(1600, 900, 800, 600)).toEqual({ width: 800, height: 450 });
    expect(computePosterSize(900, 1600, 800, 600)).toEqual({ width: 337.5, height: 600 });
    expect(computePosterSize(0, 0, 800, 600)).toBeNull();
  });
});

describe('申請済み一覧のステータス（v1 renderDataList）', () => {
  it('pending=未申請、ready/exported=承認済み、それ以外（draft）=申請済み', () => {
    expect(submittedStatusLabel('pending').label).toBe('未申請');
    expect(submittedStatusLabel('ready').label).toBe('承認済み');
    expect(submittedStatusLabel('exported').label).toBe('承認済み');
    expect(submittedStatusLabel('draft').label).toBe('申請済み');
  });

  it('理由の付いた pending は点検一覧と同じく「差戻し」', () => {
    expect(submittedStatusLabel('pending', '日付の誤り')).toEqual({ label: '差戻し', variant: 'danger' });
    expect(submittedStatusLabel('pending', '  ').label).toBe('未申請');
  });
});
