import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { PortalInspectionRow } from '@/types/portal';
import { makeReport } from './fixtures';

const api = vi.hoisted(() => ({
  registerInspectionReport: vi.fn(),
  fetchInspectionReports: vi.fn(async () => [] as unknown[]),
  sha256Hex: vi.fn(async () => 'hash-new'),
}));
vi.mock('@/lib/api/portal', () => api);
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
beforeEach(() => vi.clearAllMocks());

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

  it('再提出では差戻し理由と前の版のファイル名を出す', () => {
    setup({ previous: makeReport({ status: 'returned', review_comment: '写真が不足しています' }) });
    expect(screen.getByText('報告書の再提出')).toBeInTheDocument();
    expect(screen.getByText(/差戻し理由: 写真が不足しています/)).toBeInTheDocument();
    expect(screen.getByText(/前の版: 20261005_テスト第一ビル_消防設備点検\.pdf/)).toBeInTheDocument();
  });
});
