import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { makePropertyFile, makeReport } from './fixtures';

const api = vi.hoisted(() => ({
  fetchInspectionReports: vi.fn(),
  fetchPortalInspections: vi.fn(async () => [] as unknown[]),
  reportSignedUrl: vi.fn(),
  reviewInspectionReport: vi.fn(),
  updateInspectionReport: vi.fn(),
  downloadReportBlob: vi.fn(),
}));
vi.mock('@/lib/api/portal', () => api);
const fileApi = vi.hoisted(() => ({
  fetchPropertyFiles: vi.fn(async () => [] as unknown[]),
  deletePropertyFile: vi.fn(),
  propertyFileSignedUrl: vi.fn(),
  fetchAiOcrStatus: vi.fn(async () => ({ configured: false, message: null })),
  fetchCorrectionDictionary: vi.fn(async () => [] as unknown[]),
}));
vi.mock('@/lib/api/property-files', () => fileApi);
vi.mock('@/lib/supabase', () => ({ supabase: {}, TABLES: {}, RPC: {} }));
vi.mock('@/hooks/useAuth', () => ({
  useAuth: () => ({ isAdmin: false, isManagement: false, vendorId: 'v1', user: { id: 'u1' } }),
}));
const toast = vi.hoisted(() => vi.fn());
vi.mock('@/components/ui/Toast', () => ({ useToast: () => ({ addToast: toast }) }));
// モーダルは各テストで見る（ここでは一覧だけ）
vi.mock('../components/FileUploadModal', () => ({ FileUploadModal: () => null }));
vi.mock('../components/ReportReturnModal', () => ({ ReportReturnModal: () => null }));

import { InspectionDocuments } from '../components/InspectionDocuments';

function renderAt(url: string) {
  return render(
    <MemoryRouter initialEntries={[url]}>
      <InspectionDocuments />
    </MemoryRouter>,
  );
}

beforeAll(() => {
  // jsdom には <dialog> の showModal / close が無い（削除の確認ダイアログが使う）
  HTMLDialogElement.prototype.showModal = function (this: HTMLDialogElement) {
    this.setAttribute('open', '');
  };
  HTMLDialogElement.prototype.close = function (this: HTMLDialogElement) {
    this.removeAttribute('open');
  };
});
beforeEach(() => vi.clearAllMocks());

describe('InspectionDocuments', () => {
  it('?report=<id> で開くと、その1件だけを表示して行を強調する（受領済み・別の年でも隠れない）', async () => {
    api.fetchInspectionReports.mockResolvedValue([
      makeReport({ id: 'a', file_name: 'a.pdf' }),
      makeReport({ id: 'b', file_name: 'b.pdf', performed_on: '2025-04-01', status: 'superseded' }),
      makeReport({ id: 'c', file_name: 'c.pdf' }),
    ]);
    renderAt('/portal/documents?report=b');
    const row = await screen.findByRole('row', { current: true });
    expect(within(row).getByText('b.pdf')).toBeInTheDocument();
    expect(screen.queryByText('a.pdf')).toBeNull();
    expect(screen.queryByText('c.pdf')).toBeNull();
    expect(screen.getByRole('button', { name: 'すべての報告書を表示' })).toBeInTheDocument();
  });

  it('『開く』は報告書のファイル名をタブの名前にして PDF を出す（修正依頼1027(2) 文字化け）', async () => {
    api.fetchInspectionReports.mockResolvedValue([makeReport({ id: 'a', file_name: '20261026_テスト第一ビル_消防設備点検.pdf' })]);
    api.downloadReportBlob.mockResolvedValue(new Blob(['%PDF-1.4'], { type: 'application/pdf' }));
    const tabDoc = document.implementation.createHTMLDocument('');
    const tab = { document: tabDoc, opener: {}, location: { href: '' }, close: vi.fn() };
    const open = vi.spyOn(window, 'open').mockReturnValue(tab as unknown as Window);
    URL.createObjectURL = vi.fn(() => 'blob:report-a');
    renderAt('/portal/documents');
    const row = (await screen.findByText('20261026_テスト第一ビル_消防設備点検.pdf')).closest('tr')!;
    fireEvent.click(within(row).getByRole('button', { name: '開く' }));
    await waitFor(() => expect(tabDoc.querySelector('iframe')?.getAttribute('src')).toBe('blob:report-a'));
    expect(tabDoc.title).toBe('20261026_テスト第一ビル_消防設備点検.pdf');
    expect(tab.opener).toBeNull();
    expect(api.reportSignedUrl).not.toHaveBeenCalled();
    open.mockRestore();
  });

  it('読み込みに失敗したら「該当なし」ではなく失敗と再読み込みを出し、トーストは出さない', async () => {
    api.fetchInspectionReports.mockRejectedValue(new Error('network down'));
    renderAt('/portal/documents');
    expect(await screen.findByText(/報告書を読み込めませんでした/)).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: '再読み込み' }).length).toBeGreaterThan(0);
    expect(screen.queryByText('該当する報告書はありません')).toBeNull();
    expect(toast).not.toHaveBeenCalled();
  });

  it('点検行が業務システムで消された報告書は、その旨を出して再提出を出さない', async () => {
    api.fetchInspectionReports.mockResolvedValue([makeReport({ id: 'x', property_inspection_id: null })]);
    renderAt('/portal/documents');
    expect(await screen.findByText('点検行が削除済み')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '再提出' })).toBeNull();
  });

  it('その他ファイルは建物 → 年 → 区分名でツリーに並び、選ぶと表に出る。アップロードした本人は削除できる', async () => {
    api.fetchInspectionReports.mockResolvedValue([makeReport({ id: 'a', file_name: 'a.pdf' })]);
    fileApi.fetchPropertyFiles.mockResolvedValue([
      makePropertyFile({ id: 'f1' }),
      makePropertyFile({ id: 'f2', category: 'other', category_note: '管理規約', file_name: '規約.pdf', uploaded_by: 'u9' }),
    ]);
    renderAt('/portal/documents');
    const tree = await screen.findByRole('navigation', { name: '報告書のフォルダ' });
    fireEvent.click(within(tree).getAllByRole('button', { name: '開く' })[0]!);
    fireEvent.click(within(tree).getAllByRole('button', { name: '開く' })[0]!);
    fireEvent.click(within(tree).getByRole('button', { name: /^見積書/ }));
    const files = await screen.findByRole('table', { name: 'その他ファイル' });
    expect(within(files).getByText('見積書_エレベーター改修.pdf')).toBeInTheDocument();
    expect(within(files).queryByText('規約.pdf')).toBeNull();
    expect(within(files).getByRole('button', { name: '削除' })).toBeInTheDocument();
    expect(within(tree).getByRole('button', { name: /その他（管理規約）/ })).toBeInTheDocument();
    // 報告書の表は区分のフォルダでは0件
    expect(screen.queryByText('a.pdf')).toBeNull();
  });
});
