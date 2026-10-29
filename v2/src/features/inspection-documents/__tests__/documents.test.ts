import { describe, expect, it } from 'vitest';
import {
  DEFAULT_REPORT_FILTERS,
  buildReportTree,
  buildZipPaths,
  filterReports,
  matchesTreeSelection,
  reportPermissions,
  reportsToCsv,
  revealReport,
} from '../lib/documents';
import { makeReport } from './fixtures';

const reports = [
  makeReport({ id: 'a' }),
  makeReport({ id: 'b', performed_on: '2025-04-01', inspection_type_label: '排水管清掃' }),
  makeReport({ id: 'c', inspection_type_label: '排水管清掃', status: 'accepted' }),
  makeReport({ id: 'd', property_code: '100002', property_name: 'テスト第二ビル', vendor_id: 'v2', vendor_name: 'ベツ保守' }),
  makeReport({ id: 'old', status: 'superseded' }),
  makeReport({ id: 'del', status: 'deleted' }),
];

describe('buildReportTree', () => {
  it('建物 → 年（新しい順）→ 点検種別に件数を集計する', () => {
    const live = filterReports(reports, DEFAULT_REPORT_FILTERS);
    const tree = buildReportTree(live);
    expect(tree.map((b) => [b.propertyName, b.count])).toEqual([
      ['テスト第一ビル', 3],
      ['テスト第二ビル', 1],
    ]);
    expect(tree[0]!.years.map((y) => [y.year, y.count])).toEqual([
      ['2026', 2],
      ['2025', 1],
    ]);
    expect(tree[0]!.years[0]!.types).toEqual([
      { label: '消防設備点検', count: 1 },
      { label: '排水管清掃', count: 1 },
    ]);
  });

  it('選んだノードで行を絞る', () => {
    const sel = { propertyCode: '100001', year: '2026', inspectionType: '排水管清掃' };
    expect(reports.filter((r) => matchesTreeSelection(r, sel)).map((r) => r.id)).toEqual(['c']);
  });
});

describe('filterReports', () => {
  it('既定は置き換え済み・削除済みを除き、チェックで足す', () => {
    const ids = (f = DEFAULT_REPORT_FILTERS) => filterReports(reports, f).map((r) => r.id);
    expect(ids()).toEqual(['a', 'b', 'c', 'd']);
    expect(ids({ ...DEFAULT_REPORT_FILTERS, showDeleted: true, showSuperseded: true })).toHaveLength(6);
  });

  it('状態・期間・保守会社・検索（建物名・保守会社名、全角半角を無視）で絞る', () => {
    const ids = (f: Partial<typeof DEFAULT_REPORT_FILTERS>) =>
      filterReports(reports, { ...DEFAULT_REPORT_FILTERS, ...f }).map((r) => r.id);
    expect(ids({ status: 'accepted' })).toEqual(['c']);
    expect(ids({ from: '2026-01-01', to: '2026-12-31' })).toEqual(['a', 'c', 'd']);
    expect(ids({ vendorId: 'v2' })).toEqual(['d']);
    expect(ids({ search: '第二' })).toEqual(['d']);
    expect(ids({ search: 'べつ' })).toEqual(['d']);
  });
});

describe('buildZipPaths', () => {
  const rows = [
    makeReport({ file_name: 'x.pdf' }),
    makeReport({ file_name: 'x.pdf' }),
    makeReport({ file_name: 'x.pdf' }),
    makeReport({ file_name: 'x.pdf', performed_on: '2025-01-01' }),
  ];

  it('階層を保つと 建物/年/点検種別/ファイル名、同じパスは2件目から _1, _2（DocFlow と同じ）', () => {
    expect(buildZipPaths(rows, true)).toEqual([
      'テスト第一ビル/2026/消防設備点検/x.pdf',
      'テスト第一ビル/2026/消防設備点検/x_1.pdf',
      'テスト第一ビル/2026/消防設備点検/x_2.pdf',
      'テスト第一ビル/2025/消防設備点検/x.pdf',
    ]);
  });

  it('平らにすると年が違っても同名は連番になる', () => {
    expect(buildZipPaths(rows, false)).toEqual(['x.pdf', 'x_1.pdf', 'x_2.pdf', 'x_3.pdf']);
  });
});

describe('reportsToCsv', () => {
  it('見出し行と、カンマ・改行を含む値を引用符で囲んだ行を出す', () => {
    const csv = reportsToCsv([makeReport({ note: 'a,b' })]);
    const [header, row] = csv.split('\r\n');
    expect(header!.startsWith('ファイル名,物件コード,建物')).toBe(true);
    expect(row).toContain('"a,b"');
    expect(row).toContain('2026/10/05 10:00');
  });

  it('= などで始まる値は数式として動かないよう先頭に \' を付ける', () => {
    const row = reportsToCsv([makeReport({ note: '=HYPERLINK("x")' })]).split('\r\n')[1];
    expect(row).toContain(`"'=HYPERLINK(""x"")"`);
  });
});

describe('revealReport（?report=<id> で指した版を隠さない）', () => {
  it('旧版でも見えるよう条件を外し、ツリーをその建物・年・点検種別に合わせる', () => {
    const target = makeReport({ id: 'old', status: 'superseded', performed_on: '2025-04-01' });
    const { filters, selection } = revealReport(target, {
      ...DEFAULT_REPORT_FILTERS,
      status: 'accepted',
      from: '2026-01-01',
      search: 'ほか',
    });
    expect(filterReports([target], filters)).toHaveLength(1);
    expect(selection).toEqual({ propertyCode: '100001', year: '2025', inspectionType: '消防設備点検' });
  });
});

describe('reportPermissions の削除（修正依頼1029 決定②: 受領前〔提出のうち〕は自社の保守会社も削除できる）', () => {
  it('保守会社は自社の提出の版だけ削除でき、差戻し・受領済みは管理者だけ', () => {
    const vendor = { isAdmin: false, isManagement: false, vendorId: 'v1' };
    const admin = { isAdmin: true, isManagement: false, vendorId: null };
    expect(reportPermissions(makeReport({ vendor_id: 'v1', status: 'submitted' }), vendor).canDelete).toBe(true);
    expect(reportPermissions(makeReport({ vendor_id: 'v1', status: 'returned' }), vendor).canDelete).toBe(false);
    expect(reportPermissions(makeReport({ vendor_id: 'v1', status: 'accepted' }), vendor).canDelete).toBe(false);
    expect(reportPermissions(makeReport({ vendor_id: 'v1', status: 'returned' }), admin).canDelete).toBe(true);
  });
});
