import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, configure, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { makeInspection } from '@/features/inspection-portal/__tests__/fixtures';
import { makeReport } from './fixtures';
import { openPdfPages } from '../lib/pdfPages';

const api = vi.hoisted(() => ({
  fetchPortalInspections: vi.fn(),
  fetchPortalEntries: vi.fn(async () => [] as unknown[]),
  fetchInspectionReports: vi.fn(async () => [] as unknown[]),
  registerInspectionReport: vi.fn(),
  updateInspectionReport: vi.fn(),
  downloadReportBlob: vi.fn(async () => new Blob(['%PDF-1.4'], { type: 'application/pdf' })),
  sha256Hex: vi.fn(async () => 'hash-new'),
  fetchManagementCompanyShortNames: vi.fn(async () => [] as unknown[]),
  fetchPortalInspectionUnits: vi.fn(async () => [] as unknown[]),
  fetchInspectionTypeFlags: vi.fn(async () => [] as unknown[]),
  fetchPortalEntryUnits: vi.fn(async () => [] as unknown[]),
  fetchNotifyOff: vi.fn(async () => [] as unknown[]),
}));
vi.mock('@/lib/api/portal', () => api);
vi.mock('@/lib/api/inspection-form', () => ({ fetchCompletions: vi.fn(async () => []), fetchInspectionDates: vi.fn(async () => []) }));
const fileApi = vi.hoisted(() => ({
  fetchAiOcrStatus: vi.fn(async () => ({ configured: false, message: 'AI-OCR は未設定です（管理者に連絡）' })),
  fetchCorrectionDictionary: vi.fn(async () => [] as unknown[]),
  recordCorrections: vi.fn(async () => {}),
  readWithAiOcr: vi.fn(),
  bytesToBase64: vi.fn(() => ''),
  registerPropertyFile: vi.fn(),
  fetchPropertyFileTargets: vi.fn(async () => [] as unknown[]),
  fetchUploadPropertyAliases: vi.fn(async () => [] as unknown[]),
  fetchUploadVendorAliases: vi.fn(async () => [] as unknown[]),
}));
vi.mock('@/lib/api/property-files', () => fileApi);
vi.mock('@/lib/supabase', () => ({ supabase: {}, TABLES: {}, RPC: {} }));
const auth = vi.hoisted(() => ({ isAdmin: false, isManagement: false, vendorId: 'v1', managementCompanyId: null }));
vi.mock('@/hooks/useAuth', () => ({ useAuth: () => auth }));
const toast = vi.hoisted(() => vi.fn());
vi.mock('@/components/ui/Toast', () => ({ useToast: () => ({ addToast: toast }) }));
// jsdom には canvas の描画が無いので、pdfjs の描画は差し替える（切り出しは pdfSplit のテストで本物を確かめる）
vi.mock('../lib/pdfPages', () => ({
  openPdfPages: vi.fn(async () => ({
    pageCount: 4,
    render: vi.fn(async () => {}),
    pageTexts: vi.fn(async () => [] as string[]),
    destroy: vi.fn(),
  })),
}));
const split = vi.hoisted(() => ({
  loadSourcePdf: vi.fn(async () => ({})),
  extractPages: vi.fn(async () => new Uint8Array([37, 80, 68, 70])),
  extractRange: vi.fn(async () => new Uint8Array([37, 80, 68, 70])),
}));
vi.mock('../lib/pdfSplit', () => split);

import { FileUploadModal, type FileUploadPreset } from '../components/FileUploadModal';

configure({ asyncUtilTimeout: 5000 });

beforeAll(() => {
  HTMLDialogElement.prototype.showModal = function (this: HTMLDialogElement) {
    this.setAttribute('open', '');
  };
  HTMLDialogElement.prototype.close = function (this: HTMLDialogElement) {
    this.removeAttribute('open');
  };
});

const first = makeInspection({ inspection_id: 'i1', property_name: 'テスト第一マンション', property_code: '900001-00', inspection_months: [] });
const second = makeInspection({ inspection_id: 'i2', property_name: 'テスト第二マンション', property_code: '900002-00', inspection_months: [] });

beforeEach(() => {
  vi.clearAllMocks();
  auth.isAdmin = false;
  api.fetchInspectionReports.mockResolvedValue([]);
  api.fetchPortalInspections.mockResolvedValue([first, second]);
  fileApi.fetchUploadPropertyAliases.mockResolvedValue([
    { code: '900001-00', name: 'テスト第一マンション', aliases: ['第一マンション略称'], managementCompanyId: 'm1' },
    { code: '900002-00', name: 'テスト第二マンション', aliases: [], managementCompanyId: 'm1' },
  ]);
});

async function open(preset: FileUploadPreset, props: { vendorId?: string | null } = {}) {
  const onChanged = vi.fn();
  const onClose = vi.fn();
  render(<FileUploadModal open preset={preset} onClose={onClose} vendorId={props.vendorId ?? 'v1'} onChanged={onChanged} />);
  // 点検一覧と名前の一覧を読み終えてからファイルを入れる（ファイル名の照合に使う）
  await waitFor(() => expect(fileApi.fetchUploadPropertyAliases).toHaveBeenCalled());
  await waitFor(() => expect(api.fetchPortalEntries).toHaveBeenCalled());
  await act(async () => {});
  return { onChanged, onClose };
}

const addFiles = (...files: File[]) => fireEvent.change(screen.getByTestId('upload-file-input'), { target: { files } });
const row = (no: number) => screen.getByTestId(`upload-row-${no}`);
const pick = async (no: number, field: string, name: RegExp) => {
  fireEvent.click(screen.getByRole('combobox', { name: `行${no}の${field}` }));
  fireEvent.click(await screen.findByRole('option', { name }));
};

describe('FileUploadModal（修正依頼1029(1) ファイルのアップロード画面の統一）', { timeout: 20000 }, () => {
  it('ファイル名から区分・物件・点検種別・実施日を入れ、区間ごとに点検の報告書として登録する', async () => {
    api.registerInspectionReport.mockResolvedValue(makeReport({ file_name: 'a.pdf' }));
    const { onChanged } = await open({ kind: 'bulk' });
    addFiles(new File(['%PDF-1.4'], '20261025_第一マンション略称_エレベーター定期点検報告書.pdf', { type: 'application/pdf' }));
    await screen.findByTestId(/^upload-page-f\d+-3$/);
    expect(within(row(1)).getByLabelText('行1の区分')).toHaveValue('report');
    expect(within(row(1)).getByLabelText('行1の実施日')).toHaveValue('2026-10-25');
    expect(within(row(1)).getByRole('combobox', { name: '行1の物件' })).toHaveValue('テスト第一マンション');

    fireEvent.click(screen.getByRole('button', { name: /の2ページと3ページの間で区切る$/ }));
    expect(screen.getAllByTestId(/^upload-row-\d+$/)).toHaveLength(2);
    expect(within(row(2)).getByText('p.3-4')).toBeInTheDocument();
    await pick(2, '物件', /テスト第二マンション/);

    fireEvent.click(screen.getByRole('button', { name: '2行を登録する' }));
    await waitFor(() => expect(api.registerInspectionReport).toHaveBeenCalledTimes(2));
    expect(api.registerInspectionReport.mock.calls.map(([a]) => [a.inspectionId, a.targetMonth, a.performedOn])).toEqual([
      ['i1', '2026-10-01', '2026-10-25'],
      ['i2', '2026-10-01', '2026-10-25'],
    ]);
    expect(split.extractPages.mock.calls.map((c) => (c as unknown[])[1])).toEqual([
      [0, 1],
      [2, 3],
    ]);
    expect(onChanged).toHaveBeenCalled();
  });

  it('削除したページは送る PDF から外す', async () => {
    api.registerInspectionReport.mockResolvedValue(makeReport());
    await open({ kind: 'bulk' });
    addFiles(new File(['%PDF-1.4'], '20261025_テスト第一マンション_エレベーター定期点検.pdf', { type: 'application/pdf' }));
    await screen.findByTestId(/^upload-page-f\d+-3$/);
    fireEvent.click(screen.getByRole('button', { name: '2ページ目を削除' }));
    expect(within(row(1)).getByText('p.1-4（1ページ削除）')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '1行を登録する' }));
    await waitFor(() => expect(api.registerInspectionReport).toHaveBeenCalledTimes(1));
    expect((split.extractPages.mock.calls[0] as unknown[])[1]).toEqual([0, 2, 3]);
  });

  it('動画はその他ファイル（写真）として登録し、日付が無ければファイルの更新日を入れる', async () => {
    fileApi.registerPropertyFile.mockResolvedValue({ file_name: '20261021_テスト第一マンション_写真.mp4' });
    await open({ kind: 'other' });
    addFiles(new File(['x'], 'IMG_0001.MP4', { type: '', lastModified: Date.parse('2026-10-20T16:00:00Z') }));
    await screen.findByTestId('upload-row-1');
    expect(within(row(1)).getByLabelText('行1の区分')).toHaveValue('photo');
    expect(within(row(1)).getByLabelText('行1の実施日')).toHaveValue('2026-10-21');
    await pick(1, '物件', /テスト第一マンション/);
    fireEvent.click(screen.getByRole('button', { name: '1行を登録する' }));
    await waitFor(() => expect(fileApi.registerPropertyFile).toHaveBeenCalledTimes(1));
    const [input] = fileApi.registerPropertyFile.mock.calls[0]!;
    expect(input).toMatchObject({ propertyCode: '900001-00', category: 'photo', docDate: '2026-10-21' });
    expect(input.file.type).toBe('video/mp4');
  });

  it('管理者がその他ファイルで選んだ保守会社を登録に渡す', async () => {
    auth.isAdmin = true;
    fileApi.fetchUploadVendorAliases.mockResolvedValue([{ id: 'v2', name: '検証清掃サービス株式会社', shortName: null }]);
    fileApi.registerPropertyFile.mockResolvedValue({ file_name: 'x.pdf' });
    await open({ kind: 'other' }, { vendorId: null });
    addFiles(new File(['x'], '20261025_御見積.xlsx'));
    await screen.findByTestId('upload-row-1');
    await pick(1, '物件', /テスト第一マンション/);
    await pick(1, '保守会社', /検証清掃サービス株式会社/);
    fireEvent.click(screen.getByRole('button', { name: '1行を登録する' }));
    await waitFor(() => expect(fileApi.registerPropertyFile).toHaveBeenCalledTimes(1));
    expect(fileApi.registerPropertyFile.mock.calls[0]![0]).toMatchObject({ category: 'estimate', vendorId: 'v2' });
  });

  it('管理者以外はその他ファイルの行の保守会社を変えられない（保存では自社に固定・管理会社は空のため）', async () => {
    await open({ kind: 'other' });
    addFiles(new File(['x'], '20261025_御見積.xlsx'));
    await screen.findByTestId('upload-row-1');
    expect(within(row(1)).getByRole('combobox', { name: '行1の保守会社' })).toBeDisabled();
  });

  it('選択行の一括設定は、選んだ行の入れた項目だけを変える（変更しないの項目は行ごとの値のまま）', async () => {
    await open({ kind: 'other' });
    addFiles(new File(['x'], 'a_請求書.xlsx'), new File(['y'], 'b_請求書.xlsx'));
    await screen.findByTestId('upload-row-2');
    fireEvent.change(within(row(2)).getByLabelText('行2のメモ'), { target: { value: '2行目のメモ' } });
    fireEvent.click(within(row(1)).getByLabelText('行1を選ぶ'));
    fireEvent.click(within(row(2)).getByLabelText('行2を選ぶ'));
    const box = screen.getByTestId('upload-bulk-edit');
    fireEvent.change(within(box).getByLabelText('一括設定の区分'), { target: { value: 'estimate' } });
    fireEvent.click(within(box).getByRole('button', { name: '選択中の2行に入れる' }));
    expect(within(row(1)).getByLabelText('行1の区分')).toHaveValue('estimate');
    expect(within(row(2)).getByLabelText('行2の区分')).toHaveValue('estimate');
    expect(within(row(2)).getByLabelText('行2のメモ')).toHaveValue('2行目のメモ');
  });

  it('一括設定で「変更しない」に戻すと、入れていた値の表示を消す', async () => {
    await open({ kind: 'other' });
    addFiles(new File(['x'], 'a_請求書.xlsx'));
    await screen.findByTestId('upload-row-1');
    fireEvent.click(within(row(1)).getByLabelText('行1を選ぶ'));
    const box = screen.getByTestId('upload-bulk-edit');
    fireEvent.change(within(box).getByLabelText('一括設定の区分'), { target: { value: 'photo' } });
    fireEvent.click(within(box).getByRole('button', { name: '区分を変更しない' }));
    expect(within(box).getByLabelText('一括設定の区分')).toHaveValue('');
  });

  it('開いた行の実施日とファイル名の日付が食い違えば要確認にして止め、詳細で選び直すと登録できる', async () => {
    api.registerInspectionReport.mockResolvedValue(makeReport());
    await open({ kind: 'report', inspection: first, targetMonth: null, defaultPerformedOn: '2026-10-10' });
    addFiles(new File(['%PDF-1.4'], '20261025_報告書.pdf', { type: 'application/pdf' }));
    await screen.findByTestId(/^upload-page-f\d+-0$/);
    expect(within(row(1)).getByText('要確認')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '1行を登録する' }));
    expect(toast).toHaveBeenCalledWith(expect.stringMatching(/要確認の行が1行あります/), 'error');
    expect(api.registerInspectionReport).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: '行1の詳細' }));
    fireEvent.click(within(screen.getByTestId('upload-row-detail-1')).getByRole('button', { name: '「2026-10-25」にする' }));
    expect(within(row(1)).queryByText('要確認')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: '1行を登録する' }));
    await waitFor(() => expect(api.registerInspectionReport).toHaveBeenCalledTimes(1));
    expect(api.registerInspectionReport.mock.calls[0]![0]).toMatchObject({ inspectionId: 'i1', performedOn: '2026-10-25', targetMonth: '2026-10-01' });
  });

  it('再提出で開くと登録済みの報告書を並べ、受領前の自社の報告書は保守会社も削除できる（決定②）', async () => {
    const mine = makeReport({ id: 'r1', property_inspection_id: 'i1', target_month: '2026-10-01', status: 'submitted', file_name: '自社の版.pdf' });
    const accepted = makeReport({ id: 'r2', property_inspection_id: 'i1', target_month: '2026-10-01', status: 'accepted', file_name: '受領済みの版.pdf' });
    api.fetchInspectionReports.mockResolvedValue([mine, accepted]);
    api.updateInspectionReport.mockResolvedValue({ ...mine, status: 'deleted' });
    await open({ kind: 'report', inspection: first, targetMonth: '2026-10-01', previous: mine });
    const list = await screen.findByRole('region', { name: '登録済みの報告書' });
    await within(list).findByText('自社の版.pdf');
    expect(within(list).getByRole('button', { name: '自社の版.pdf を削除' })).toBeInTheDocument();
    expect(within(list).queryByRole('button', { name: '受領済みの版.pdf を削除' })).toBeNull();
    fireEvent.click(within(list).getByRole('button', { name: '自社の版.pdf を削除' }));
    fireEvent.click(screen.getByRole('button', { name: '削除' }));
    await waitFor(() => expect(api.updateInspectionReport).toHaveBeenCalledWith('r1', 'delete'));
  });

  it('編集で開いて足したファイルの実施日は、報告書の実施日を入れておく', async () => {
    const report = makeReport({ id: 'r1', property_inspection_id: 'i1', property_name: 'テスト第一マンション', inspection_type_label: 'エレベーター定期点検', performed_on: '2026-10-05' });
    api.fetchInspectionReports.mockResolvedValue([report]);
    await open({ kind: 'edit', report, inspection: first });
    addFiles(new File(['%PDF-1.4'], 'camera_report.pdf', { type: 'application/pdf', lastModified: Date.parse('2026-10-28T03:00:00Z') }));
    await screen.findByTestId(/^upload-page-f\d+-0$/);
    expect(within(row(1)).getByLabelText('行1の実施日')).toHaveValue('2026-10-05');
    expect(within(row(1)).queryByText('要確認')).toBeNull();
  });

  it('編集で開くと報告書の編集欄を出し、実施日・ファイル名・メモを保存する', async () => {
    const report = makeReport({ id: 'r1', property_inspection_id: 'i1', property_name: 'テスト第一マンション', inspection_type_label: 'エレベーター定期点検', performed_on: '2026-10-05', file_name: '20261005_テスト第一マンション_エレベーター定期点検.pdf' });
    api.fetchInspectionReports.mockResolvedValue([report]);
    api.updateInspectionReport.mockResolvedValue({ ...report, performed_on: '2026-10-07' });
    await open({ kind: 'edit', report, inspection: first });
    const form = await screen.findByTestId('report-edit-form');
    fireEvent.change(within(form).getByLabelText('報告書の実施日'), { target: { value: '2026-10-07' } });
    expect(within(form).getByLabelText('報告書のファイル名')).toHaveValue('20261007_テスト第一マンション_エレベーター定期点検.pdf');
    fireEvent.change(within(form).getByLabelText('報告書のメモ'), { target: { value: '直しました' } });
    fireEvent.click(within(form).getByRole('button', { name: '保存' }));
    await waitFor(() =>
      expect(api.updateInspectionReport).toHaveBeenCalledWith('r1', 'edit', {
        performedOn: '2026-10-07',
        targetMonth: '2026-10-01',
        fileName: '20261007_テスト第一マンション_エレベーター定期点検.pdf',
        note: '直しました',
      }),
    );
  });

  it('登録済みの報告書の編集欄に入力したままのキャンセルも、破棄の確認を出す', async () => {
    const report = makeReport({ id: 'r1', property_inspection_id: 'i1', note: null });
    api.fetchInspectionReports.mockResolvedValue([report]);
    const { onClose } = await open({ kind: 'edit', report, inspection: first });
    const form = await screen.findByTestId('report-edit-form');
    fireEvent.change(within(form).getByLabelText('報告書のメモ'), { target: { value: '直しかけ' } });
    fireEvent.click(screen.getByRole('button', { name: 'キャンセル' }));
    expect(screen.getByText('入力した内容は破棄されます。閉じますか？')).toBeInTheDocument();
    expect(onClose).not.toHaveBeenCalled();
  });

  it('入力したファイルがあるときのキャンセルは破棄の確認を出し、何も入れていなければすぐ閉じる', async () => {
    const { onClose } = await open({ kind: 'other' });
    fireEvent.click(screen.getByRole('button', { name: 'キャンセル' }));
    expect(onClose).toHaveBeenCalledTimes(1);
    onClose.mockClear();
    addFiles(new File(['x'], '20261025_御見積.xlsx'));
    await screen.findByTestId('upload-row-1');
    fireEvent.click(screen.getByRole('button', { name: 'キャンセル' }));
    expect(screen.getByText('入力した内容は破棄されます。閉じますか？')).toBeInTheDocument();
    expect(onClose).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: '破棄して閉じる' }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('保守会社は一覧と同じく略称で出し、正式名でも探せる', async () => {
    auth.isAdmin = true;
    fileApi.fetchUploadVendorAliases.mockResolvedValue([{ id: 'v2', name: '三菱電機ビルソリューションズ株式会社', shortName: '三菱電機ﾋﾞﾙｿﾘｭｰｼｮﾝｽﾞ㈱' }]);
    await open({ kind: 'other' }, { vendorId: null });
    addFiles(new File(['x'], '20261025_御見積.xlsx'));
    await screen.findByTestId('upload-row-1');
    const box = screen.getByRole('combobox', { name: '行1の保守会社' });
    fireEvent.click(box);
    fireEvent.change(box, { target: { value: 'ビルソリューションズ株式会社' } });
    fireEvent.click(await screen.findByRole('option', { name: /三菱電機ﾋﾞﾙｿﾘｭｰｼｮﾝｽﾞ㈱/ }));
    expect(box).toHaveValue('三菱電機ﾋﾞﾙｿﾘｭｰｼｮﾝｽﾞ㈱');
  });

  it('空白ページが無ければ「空白ページはありませんでした」をファイルの欄に出す', async () => {
    await open({ kind: 'bulk' });
    addFiles(new File(['%PDF-1.4'], '20261025_テスト第一マンション_エレベーター定期点検.pdf', { type: 'application/pdf' }));
    await screen.findByTestId(/^upload-page-f\d+-3$/);
    fireEvent.click(screen.getByRole('button', { name: '空白ページを削除' }));
    expect(await within(screen.getByTestId('upload-source')).findByText('空白ページはありませんでした')).toBeInTheDocument();
  });

  it('空白ページを探せなかったときは、その理由をファイルの欄に残す', async () => {
    vi.mocked(openPdfPages).mockResolvedValueOnce({
      pageCount: 4,
      render: vi.fn(async () => {}),
      pageTexts: vi.fn(async () => {
        throw new Error('読めない PDF');
      }),
      destroy: vi.fn(),
    });
    await open({ kind: 'bulk' });
    addFiles(new File(['%PDF-1.4'], '20261025_テスト第一マンション_エレベーター定期点検.pdf', { type: 'application/pdf' }));
    await screen.findByTestId(/^upload-page-f\d+-3$/);
    fireEvent.click(screen.getByRole('button', { name: '空白ページを削除' }));
    expect(await within(screen.getByTestId('upload-source')).findByText(/^空白ページを探せませんでした/)).toBeInTheDocument();
  });

  it('空白ページを探している途中で閉じたときは、閉じた後に失敗を知らせない', async () => {
    let fail: (err: Error) => void = () => {};
    vi.mocked(openPdfPages).mockResolvedValueOnce({
      pageCount: 4,
      render: vi.fn(async () => {}),
      pageTexts: vi.fn(() => new Promise<string[]>((_, reject) => { fail = reject; })),
      destroy: vi.fn(),
    });
    await open({ kind: 'bulk' });
    addFiles(new File(['%PDF-1.4'], '20261025_テスト第一マンション_エレベーター定期点検.pdf', { type: 'application/pdf' }));
    await screen.findByTestId(/^upload-page-f\d+-3$/);
    fireEvent.click(screen.getByRole('button', { name: '空白ページを削除' }));
    toast.mockClear();
    cleanup();
    fail(new Error('文書は片付けられました'));
    await new Promise((r) => setTimeout(r, 0));
    expect(toast).not.toHaveBeenCalledWith(expect.stringMatching(/^空白ページを探せませんでした/), 'error');
  });

  it('空白ページにもう削除の印が付いていれば、そう出す。ページの「戻す」でその文言は消す', async () => {
    // jsdom には canvas の描画が無いので、真っ白なページとして読ませる
    const getContext = vi
      .spyOn(HTMLCanvasElement.prototype, 'getContext')
      .mockReturnValue({ getImageData: () => ({ data: new Uint8ClampedArray(300 * 150 * 4).fill(255) }) } as unknown as CanvasRenderingContext2D);
    try {
      await open({ kind: 'bulk' });
      addFiles(new File(['%PDF-1.4'], '20261025_テスト第一マンション_エレベーター定期点検.pdf', { type: 'application/pdf' }));
      await screen.findByTestId(/^upload-page-f\d+-3$/);
      const box = screen.getByTestId('upload-source');
      fireEvent.click(screen.getByRole('button', { name: '空白ページを削除' }));
      expect(await within(box).findByText(/^4ページを削除しました/)).toBeInTheDocument();
      fireEvent.click(screen.getByRole('button', { name: '空白ページを削除' }));
      expect(await within(box).findByText('空白ページはすべて削除の印が付いています（p.1・2・3・4）')).toBeInTheDocument();
      fireEvent.click(screen.getByRole('button', { name: '1ページ目の削除を戻す' }));
      expect(within(box).queryByText(/空白ページは/)).not.toBeInTheDocument();
    } finally {
      getContext.mockRestore();
    }
  });

  it('ファイル名の物件から入れた管理会社は、値の出どころを「物件から」と出す', async () => {
    await open({ kind: 'bulk' });
    addFiles(new File(['%PDF-1.4'], '20261025_第一マンション略称_エレベーター定期点検報告書.pdf', { type: 'application/pdf' }));
    await screen.findByTestId(/^upload-page-f\d+-3$/);
    fireEvent.click(screen.getByRole('button', { name: '行1の詳細' }));
    const detail = screen.getByTestId('upload-row-detail-1');
    expect(within(detail).getByText(/管理会社=テスト管理（物件から）/)).toBeInTheDocument();
    expect(within(detail).getByText(/物件=テスト第一マンション（ファイル名）/)).toBeInTheDocument();
  });
});
