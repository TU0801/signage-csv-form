import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { makeInspection } from '@/features/inspection-portal/__tests__/fixtures';
import { makeReport } from './fixtures';

const api = vi.hoisted(() => ({
  fetchPortalInspections: vi.fn(),
  fetchPortalEntries: vi.fn(async () => [] as unknown[]),
  fetchInspectionReports: vi.fn(async () => [] as unknown[]),
  registerInspectionReport: vi.fn(),
}));
vi.mock('@/lib/api/portal', () => api);
vi.mock('@/lib/supabase', () => ({ supabase: {}, TABLES: {}, RPC: {} }));
const toast = vi.hoisted(() => vi.fn());
vi.mock('@/components/ui/Toast', () => ({ useToast: () => ({ addToast: toast }) }));
// jsdom には canvas の描画が無いので、pdfjs の描画は差し替える（回転・切り出しは pdfSplit のテストで本物を確かめる）
vi.mock('../lib/pdfPages', () => ({
  openPdfPages: vi.fn(async () => ({ pageCount: 4, render: vi.fn(async () => {}), destroy: vi.fn() })),
}));
const split = vi.hoisted(() => ({
  loadSourcePdf: vi.fn(async () => ({})),
  extractRange: vi.fn(async () => new Uint8Array([37, 80, 68, 70])),
}));
vi.mock('../lib/pdfSplit', () => split);

import { BulkReportUploadModal } from '../components/BulkReportUploadModal';

beforeAll(() => {
  HTMLDialogElement.prototype.showModal = function (this: HTMLDialogElement) {
    this.setAttribute('open', '');
  };
  HTMLDialogElement.prototype.close = function (this: HTMLDialogElement) {
    this.removeAttribute('open');
  };
});
beforeEach(() => {
  vi.clearAllMocks();
  api.fetchPortalInspections.mockResolvedValue([
    makeInspection({ inspection_id: 'i1', property_name: 'テスト第一マンション', inspection_months: [] }),
    makeInspection({ inspection_id: 'i2', property_name: 'テスト第二マンション', inspection_months: [] }),
  ]);
});

async function setup() {
  const onUploaded = vi.fn();
  const onClose = vi.fn();
  render(<BulkReportUploadModal open onClose={onClose} vendorId="v1" onUploaded={onUploaded} />);
  fireEvent.change(screen.getByTestId('bulk-report-file-input'), {
    target: { files: [new File(['%PDF-1.4'], 'まとめ.pdf', { type: 'application/pdf' })] },
  });
  await screen.findByTestId('bulk-page-4');
  // 選択肢（点検一覧）の読み込みを待つ
  await screen.findAllByRole('option', { name: /テスト第二マンション/ });
  return { onUploaded, onClose };
}

const pick = (no: number, name: RegExp) => {
  const select = screen.getByRole('combobox', { name: `区間${no}の点検` }) as HTMLSelectElement;
  const option = within(select).getByRole('option', { name }) as HTMLOptionElement;
  fireEvent.change(select, { target: { value: option.value } });
};

describe('BulkReportUploadModal', () => {
  it('ページの間を押して区間を分け、同じ点検を2区間に割り当てると送らない', async () => {
    await setup();
    expect(screen.getAllByTestId(/^bulk-segment-/)).toHaveLength(1);
    fireEvent.click(screen.getByRole('button', { name: '2ページと3ページの間で区切る' }));
    expect(screen.getAllByTestId(/^bulk-segment-/)).toHaveLength(2);
    expect(within(screen.getByTestId('bulk-segment-2')).getByText('p.3-4')).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText('実施日（全区間の既定）'), { target: { value: '2026-10-05' } });
    pick(1, /テスト第一マンション/);
    pick(2, /テスト第一マンション/);
    fireEvent.click(screen.getByRole('button', { name: '2区間を提出する' }));
    expect(await screen.findAllByText(/同じ点検・対象月が 区間1・区間2 に割り当てられています/)).toHaveLength(2);
    expect(api.registerInspectionReport).not.toHaveBeenCalled();
  });

  it('区間ごとに切り出して順に登録し、途中で失敗しても残りを続けて結果を区間ごとに出す', async () => {
    api.registerInspectionReport
      .mockRejectedValueOnce({ message: 'この点検の報告書を登録する権限がありません', code: '42501' })
      .mockResolvedValueOnce(makeReport({ file_name: '20261005_テスト第二マンション_エレベーター定期点検.pdf' }));
    const { onUploaded } = await setup();
    fireEvent.click(screen.getByRole('button', { name: '1ページと2ページの間で区切る' }));
    fireEvent.click(screen.getByRole('button', { name: '1ページ目を右に90度回す' }));
    fireEvent.change(screen.getByLabelText('実施日（全区間の既定）'), { target: { value: '2026-10-05' } });
    pick(1, /テスト第一マンション/);
    pick(2, /テスト第二マンション/);
    fireEvent.change(screen.getByLabelText('区間2のメモ'), { target: { value: '2号機' } });
    fireEvent.click(screen.getByRole('button', { name: '2区間を提出する' }));

    expect(await within(screen.getByTestId('bulk-segment-2')).findByText(/提出しました/)).toBeInTheDocument();
    expect(within(screen.getByTestId('bulk-segment-1')).getByText(/失敗: この点検の報告書を登録する権限がありません/)).toBeInTheDocument();
    expect(split.extractRange).toHaveBeenNthCalledWith(1, {}, { start: 0, end: 0, no: 1 }, { 0: 90 });
    expect(split.extractRange).toHaveBeenNthCalledWith(2, {}, { start: 1, end: 3, no: 2 }, { 0: 90 });
    expect(api.registerInspectionReport).toHaveBeenCalledTimes(2);
    expect(api.registerInspectionReport.mock.calls[1]![0]).toMatchObject({
      inspectionId: 'i2',
      targetMonth: null,
      performedOn: '2026-10-05',
      fileName: '20261005_テスト第二マンション_エレベーター定期点検.pdf',
      note: '2号機',
    });
    expect((api.registerInspectionReport.mock.calls[1]![0] as { file: File }).file.name).toBe('まとめ_p2-4.pdf');
    await waitFor(() => expect(onUploaded).toHaveBeenCalledTimes(1));
    // 失敗した区間だけを再送できる
    expect(screen.getByRole('button', { name: '残りの1区間を提出する' })).toBeInTheDocument();
  });

  it('送信の途中は Escape・背景・× で閉じない', async () => {
    let resolve!: (v: unknown) => void;
    api.registerInspectionReport.mockImplementationOnce(() => new Promise((r) => (resolve = r)));
    const { onClose } = await setup();
    fireEvent.change(screen.getByLabelText('実施日（全区間の既定）'), { target: { value: '2026-10-05' } });
    pick(1, /テスト第一マンション/);
    fireEvent.click(screen.getByRole('button', { name: '1区間を提出する' }));
    await waitFor(() => expect(api.registerInspectionReport).toHaveBeenCalledTimes(1));

    const dialog = screen.getByTestId('bulk-segment-1').closest('dialog')!;
    const cancel = new Event('cancel', { cancelable: true });
    fireEvent(dialog, cancel);
    expect(cancel.defaultPrevented).toBe(true);
    fireEvent.mouseDown(dialog);
    fireEvent.click(dialog);
    fireEvent.click(screen.getByRole('button', { name: '閉じる', hidden: true }));
    expect(onClose).not.toHaveBeenCalled();

    resolve(makeReport({ file_name: 'a.pdf' }));
    expect(await within(screen.getByTestId('bulk-segment-1')).findByText(/提出しました/)).toBeInTheDocument();
  });

  it('区切りを変えると前の失敗の表示を消す', async () => {
    api.registerInspectionReport.mockRejectedValueOnce({ message: '通信に失敗しました' });
    await setup();
    fireEvent.change(screen.getByLabelText('実施日（全区間の既定）'), { target: { value: '2026-10-05' } });
    pick(1, /テスト第一マンション/);
    fireEvent.click(screen.getByRole('button', { name: '1区間を提出する' }));
    expect(await within(screen.getByTestId('bulk-segment-1')).findByText(/失敗:/)).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: '2ページと3ページの間で区切る' }));
    fireEvent.click(screen.getByRole('button', { name: '2ページと3ページの間の区切りを外す' }));
    expect(screen.queryByText(/失敗:/)).toBeNull();
  });

  it('実施日が今日より後なら区間ごとに注意を出す（提出は止めない）', async () => {
    await setup();
    fireEvent.change(screen.getByLabelText('実施日（全区間の既定）'), { target: { value: '2999-01-01' } });
    expect(
      within(screen.getByTestId('bulk-segment-1')).getByText('実施日が未来の日付です。誤りがないか確かめてください'),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '1区間を提出する' })).toBeEnabled();
    fireEvent.change(screen.getByLabelText('区間1の実施日'), { target: { value: '2026-10-01' } });
    expect(screen.queryByText(/実施日が未来の日付です/)).toBeNull();
  });
});
