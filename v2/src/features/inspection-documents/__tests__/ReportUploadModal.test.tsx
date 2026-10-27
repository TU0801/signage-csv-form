import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import type { PortalInspectionRow } from '@/types/portal';
import { makeReport } from './fixtures';

const api = vi.hoisted(() => ({
  registerInspectionReport: vi.fn(),
  fetchInspectionReports: vi.fn(async () => [] as unknown[]),
  sha256Hex: vi.fn(async () => 'hash-new'),
  updateInspectionReport: vi.fn(),
  downloadReportBlob: vi.fn(async () => new Blob(['%PDF-1.4'], { type: 'application/pdf' })),
}));
vi.mock('@/lib/api/portal', () => api);
const auth = vi.hoisted(() => ({ isAdmin: false }));
vi.mock('@/hooks/useAuth', () => ({ useAuth: () => auth }));
// jsdom には canvas の描画が無いので、プレビューの pdfjs は差し替える
vi.mock('../lib/pdfPages', () => ({
  openPdfPages: vi.fn(async () => ({ pageCount: 1, render: vi.fn(async () => {}), pageTexts: vi.fn(async () => []), destroy: vi.fn() })),
}));
vi.mock('@/lib/supabase', () => ({ supabase: {}, TABLES: {}, RPC: {} }));
const toast = vi.hoisted(() => vi.fn());
vi.mock('@/components/ui/Toast', () => ({ useToast: () => ({ addToast: toast }) }));

import { ReportUploadModal } from '../components/ReportUploadModal';

beforeAll(() => {
  // jsdom には <dialog> の showModal / close が無い。open 属性を付け外しして、開いたものだけを role で引けるようにする
  HTMLDialogElement.prototype.showModal = function (this: HTMLDialogElement) {
    this.setAttribute('open', '');
  };
  HTMLDialogElement.prototype.close = function (this: HTMLDialogElement) {
    this.removeAttribute('open');
  };
});
beforeEach(() => {
  vi.clearAllMocks();
  api.fetchInspectionReports.mockResolvedValue([]);
  auth.isAdmin = false;
});

const inspection: PortalInspectionRow = {
  inspection_id: 'pi1',
  property_code: '100001',
  property_name: 'テスト第一ビル',
  terminal_count: 1,
  terminal_ids: ['T001'],
  management_company_id: null,
  management_company_name: null,
  inspection_type_id: 't1',
  inspection_type_label: '消防設備点検',
  template_no: null,
  vendor_id: 'v1',
  vendor_name: 'テスト保守',
  unit_vendor_ids: [],
  inspection_months: [10],
  schedule_from: '2026-01-01',
  remarks: '',
};

function setup(props: Partial<Parameters<typeof ReportUploadModal>[0]> = {}) {
  const onUploaded = vi.fn();
  render(
    <ReportUploadModal
      open
      onClose={vi.fn()}
      inspection={inspection}
      targetMonth="2026-10-01"
      onUploaded={onUploaded}
      {...props}
    />,
  );
  const fileInput = screen.getByTestId('report-file-input');
  const choose = (file: File) => fireEvent.change(fileInput, { target: { files: [file] } });
  return { onUploaded, choose };
}

const pdfFile = () => new File(['%PDF-1.4'], 'scan.pdf', { type: 'application/pdf' });

describe('ReportUploadModal', () => {
  it('PDF 以外を選ぶとその場で止め、実施日が無ければ送らない', async () => {
    const { choose } = setup();
    choose(new File(['x'], 'photo.png', { type: 'image/png' }));
    expect(screen.getByText('PDF ファイルを選んでください')).toBeInTheDocument();

    choose(pdfFile());
    fireEvent.click(screen.getByRole('button', { name: '提出する' }));
    expect(await screen.findByText('実施日を入力してください')).toBeInTheDocument();
    expect(api.registerInspectionReport).not.toHaveBeenCalled();
  });

  it('実施日からファイル名を作って見せ、その名前で登録する', async () => {
    api.registerInspectionReport.mockResolvedValue(makeReport());
    const { choose, onUploaded } = setup();
    choose(pdfFile());
    fireEvent.change(screen.getByLabelText('実施日（必須）'), { target: { value: '2026-10-05' } });
    expect(screen.getByText('20261005_テスト第一ビル_消防設備点検.pdf')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '提出する' }));
    await waitFor(() => expect(onUploaded).toHaveBeenCalled());
    expect(api.registerInspectionReport).toHaveBeenCalledWith(
      expect.objectContaining({
        inspectionId: 'pi1',
        targetMonth: '2026-10-01',
        performedOn: '2026-10-05',
        fileName: '20261005_テスト第一ビル_消防設備点検.pdf',
      }),
    );
  });

  it('同じ内容のファイルが同じ点検にあれば、確認を出して送らない', async () => {
    api.fetchInspectionReports.mockResolvedValue([makeReport({ content_hash: 'hash-new' })]);
    const { choose } = setup();
    choose(pdfFile());
    fireEvent.change(screen.getByLabelText('実施日（必須）'), { target: { value: '2026-10-05' } });
    fireEvent.click(screen.getByRole('button', { name: '提出する' }));
    expect(await screen.findByText('同じファイルがあります')).toBeInTheDocument();
    expect(api.registerInspectionReport).not.toHaveBeenCalled();
  });

  it('再提出では差戻し理由を出し、登録済みの報告書は置き換えずに残る旨を出す', () => {
    setup({ previous: makeReport({ status: 'returned', review_comment: '写真が不足しています' }) });
    expect(screen.getByText('報告書の再提出')).toBeInTheDocument();
    expect(screen.getByText(/差戻し理由: 写真が不足しています/)).toBeInTheDocument();
    expect(screen.getByText(/登録済みの報告書は置き換えず、追加します/)).toBeInTheDocument();
  });

  it('実施日の既定は行の点検開始日（修正依頼1027(1)）', () => {
    setup({ previous: makeReport(), defaultPerformedOn: '2026-10-25' });
    expect((screen.getByLabelText('実施日（必須）') as HTMLInputElement).value).toBe('2026-10-25');
  });

  it('同じ点検・対象月の登録済みの報告書を並べ、削除ボタンは管理者だけに出す（修正依頼1027 決定①②）', async () => {
    const reports = [
      makeReport({ id: 'r1', file_name: '20261005_A.pdf' }),
      makeReport({ id: 'r2', file_name: '20261006_B.pdf', created_at: '2026-10-06T01:00:00Z' }),
      makeReport({ id: 'r3', file_name: '20261007_削除済み.pdf', status: 'deleted' }),
      makeReport({ id: 'r4', file_name: '20260905_別の月.pdf', target_month: '2026-09-01' }),
    ];
    api.fetchInspectionReports.mockResolvedValue(reports);
    setup();
    const list = await screen.findByRole('list', { name: '登録済みの報告書' });
    expect(within(list).getAllByRole('listitem').map((li) => li.textContent)).toEqual([
      expect.stringContaining('20261006_B.pdf'),
      expect.stringContaining('20261005_A.pdf'),
    ]);
    expect(within(list).queryByRole('button', { name: /削除/ })).toBeNull();
    cleanup();

    auth.isAdmin = true;
    api.updateInspectionReport.mockResolvedValue(makeReport({ id: 'r1', status: 'deleted' }));
    const onDeleted = vi.fn();
    setup({ onDeleted });
    const adminList = await screen.findByRole('list', { name: '登録済みの報告書' });
    fireEvent.click(within(adminList).getByRole('button', { name: '20261005_A.pdf を削除' }));
    fireEvent.click(await screen.findByRole('button', { name: '削除' }));
    await waitFor(() => expect(api.updateInspectionReport).toHaveBeenCalledWith('r1', 'delete'));
    await waitFor(() => expect(within(adminList).queryByText('20261005_A.pdf')).toBeNull());
    expect(onDeleted).toHaveBeenCalled();
  });

  it('送信の途中は Escape・× で閉じない', async () => {
    let resolve!: (v: unknown) => void;
    api.fetchInspectionReports.mockResolvedValue([]);
    api.registerInspectionReport.mockImplementationOnce(() => new Promise((r) => (resolve = r)));
    const onClose = vi.fn();
    const { choose } = setup({ onClose });
    choose(pdfFile());
    fireEvent.change(screen.getByLabelText('実施日（必須）'), { target: { value: '2026-10-05' } });
    fireEvent.click(screen.getByRole('button', { name: '提出する' }));
    await waitFor(() => expect(api.registerInspectionReport).toHaveBeenCalledTimes(1));

    const dialog = screen.getByLabelText('実施日（必須）').closest('dialog')!;
    const cancel = new Event('cancel', { cancelable: true });
    fireEvent(dialog, cancel);
    expect(cancel.defaultPrevented).toBe(true);
    // 先頭の × が外のモーダルのもの（後ろは中の確認ダイアログ）
    fireEvent.click(within(dialog).getAllByRole('button', { name: '閉じる', hidden: true })[0]!);
    expect(onClose).not.toHaveBeenCalled();

    resolve(makeReport());
    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
  });
});
