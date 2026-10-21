import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { makeReport } from './fixtures';

const api = vi.hoisted(() => ({
  fetchInspectionReports: vi.fn(),
  fetchPortalInspections: vi.fn(async () => [] as unknown[]),
  reportSignedUrl: vi.fn(),
  reviewInspectionReport: vi.fn(),
  updateInspectionReport: vi.fn(),
}));
vi.mock('@/lib/api/portal', () => api);
vi.mock('@/lib/supabase', () => ({ supabase: {}, TABLES: {}, RPC: {} }));
vi.mock('@/hooks/useAuth', () => ({ useAuth: () => ({ isAdmin: false, isManagement: false, vendorId: 'v1' }) }));
const toast = vi.hoisted(() => vi.fn());
vi.mock('@/components/ui/Toast', () => ({ useToast: () => ({ addToast: toast }) }));
// モーダルは各テストで見る（ここでは一覧だけ）
vi.mock('../components/ReportUploadModal', () => ({ ReportUploadModal: () => null }));
vi.mock('../components/ReportEditModal', () => ({ ReportEditModal: () => null }));
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
});
