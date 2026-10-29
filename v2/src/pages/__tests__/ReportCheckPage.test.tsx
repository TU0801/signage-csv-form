import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { ToastProvider } from '@/components/ui/Toast';
import { useAuthStore } from '@/stores/authStore';
import type { DbProfile } from '@/types/database';
import { makeInspection, makeReport } from '@/features/inspection-portal/__tests__/fixtures';

vi.mock('@/lib/supabase', () => ({ supabase: { auth: {} }, TABLES: {}, RPC: {}, BUCKETS: {} }));
const portalApi = vi.hoisted(() => ({
  fetchPortalInspections: vi.fn(),
  fetchPortalEntries: vi.fn(),
  fetchInspectionReports: vi.fn(),
  fetchPortalInspectionUnits: vi.fn(),
  fetchInspectionTypeFlags: vi.fn(),
  fetchPortalEntryUnits: vi.fn(),
  fetchNotifyOff: vi.fn(),
  registerInspectionReport: vi.fn(),
  sha256Hex: vi.fn(),
}));
vi.mock('@/lib/api/portal', () => portalApi);
const formApi = vi.hoisted(() => ({
  fetchCompletions: vi.fn(),
  fetchInspectionDates: vi.fn(),
  fetchScopedManagementCompanies: vi.fn(),
}));
vi.mock('@/lib/api/inspection-form', () => formApi);
// 報告書UP はファイルアップロードの画面（修正依頼1029 決定①。画面そのものは FileUploadModal のテストで見る）。開いた区分と点検だけを見る
vi.mock('@/features/inspection-documents/components/FileUploadModal', () => ({
  FileUploadModal: (p: { open: boolean; preset: { kind: string; inspection: { property_name: string } } | null }) =>
    p.open && p.preset ? <p>ファイルアップロード（{p.preset.kind}・{p.preset.inspection.property_name}）</p> : null,
}));

import { ReportCheckPage } from '../ReportCheckPage';

const vendorProfile: DbProfile = {
  id: 'user-1',
  email: 'user@example.com',
  company_name: null,
  role: 'user',
  vendor_id: 'v1',
  status: 'active',
  created_at: null,
  updated_at: null,
};

const ALL = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];

describe('報告書確認（申請不要の点検の報告書。修正依頼1027）', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // jsdom の <dialog> は showModal/close を持たないことがある
    HTMLDialogElement.prototype.showModal ??= function (this: HTMLDialogElement) {
      this.open = true;
    };
    HTMLDialogElement.prototype.close ??= function (this: HTMLDialogElement) {
      this.open = false;
    };
    vi.useFakeTimers({ toFake: ['Date'] });
    // 日本時間 2026-10-21
    vi.setSystemTime(new Date('2026-10-21T03:00:00Z'));
    useAuthStore.setState({ user: { id: 'user-1' } as never, profile: vendorProfile });
    portalApi.fetchPortalInspections.mockResolvedValue([
      makeInspection({ inspection_id: 'i1', property_code: '900001-00', property_name: '物件A', inspection_type_label: 'リモート点検', inspection_months: ALL }),
      makeInspection({ inspection_id: 'i2', property_code: '900002-00', property_name: '物件B', inspection_type_label: 'リモート点検', inspection_months: ALL }),
      // 申請の要る点検は出さない
      makeInspection({ inspection_id: 'i3', property_code: '900003-00', property_name: '物件C', inspection_type_id: 't3', inspection_months: [10] }),
    ]);
    portalApi.fetchPortalEntries.mockResolvedValue([]);
    portalApi.fetchInspectionReports.mockResolvedValue([
      makeReport({ id: 'r1', property_inspection_id: 'i1', target_month: '2026-10-01', performed_on: '2026-10-05', created_at: '2026-10-06T01:00:00Z' }),
    ]);
    portalApi.fetchPortalInspectionUnits.mockResolvedValue([]);
    portalApi.fetchInspectionTypeFlags.mockResolvedValue([]);
    portalApi.fetchPortalEntryUnits.mockResolvedValue([]);
    portalApi.fetchNotifyOff.mockResolvedValue([
      { inspection_id: 'i1', unit_id: null },
      { inspection_id: 'i2', unit_id: null },
    ]);
    formApi.fetchCompletions.mockResolvedValue([]);
    formApi.fetchInspectionDates.mockResolvedValue([]);
    formApi.fetchScopedManagementCompanies.mockResolvedValue([]);
  });
  afterEach(() => {
    cleanup();
    vi.useRealTimers();
    useAuthStore.setState({ user: null, profile: null });
  });

  const renderPage = () =>
    render(
      <ToastProvider>
        <ReportCheckPage />
      </ToastProvider>,
    );
  const rowOf = (name: string) => screen.getByText(name).closest('tr')!;

  it('既定は今月。申請不要の点検だけを物件ごとに出し、届いた報告書と未着を件数つきで出す', async () => {
    renderPage();
    await waitFor(() => expect(screen.getByText('物件A')).toBeInTheDocument());
    expect(screen.getByRole('combobox', { name: '対象月' })).toHaveValue('2026-10-01');
    expect(screen.queryByText('物件C')).toBeNull();
    expect(screen.getByTestId('report-summary')).toHaveTextContent('2件中 1件 届いた（未着 1件）');
    expect(within(rowOf('物件A')).getByText('提出')).toBeInTheDocument();
    expect(within(rowOf('物件A')).getByText(/2026\/10\/05/)).toBeInTheDocument();
    expect(within(rowOf('物件B')).getByText('未着')).toBeInTheDocument();
  });

  it('未着だけ・対象月で絞り込み、報告書UP で登録の画面を開く', async () => {
    renderPage();
    await waitFor(() => expect(screen.getByText('物件A')).toBeInTheDocument());
    fireEvent.click(screen.getByRole('checkbox', { name: '未着だけ' }));
    expect(screen.queryByText('物件A')).toBeNull();
    // 件数は「未着だけ」に関係なく対象月の全件
    expect(screen.getByTestId('report-summary')).toHaveTextContent('2件中 1件 届いた（未着 1件）');
    fireEvent.click(screen.getByRole('checkbox', { name: '未着だけ' }));

    fireEvent.change(screen.getByRole('combobox', { name: '対象月' }), { target: { value: '2026-09-01' } });
    expect(screen.getByTestId('report-summary')).toHaveTextContent('2件中 0件 届いた（未着 2件）');

    fireEvent.click(within(rowOf('物件B')).getByRole('button', { name: '報告書UP' }));
    // 報告書UP はファイルアップロードの画面で開く（修正依頼1029 決定①）
    expect(await screen.findByText('ファイルアップロード（report・物件B）')).toBeInTheDocument();
  });

  it('対象月の選択肢は行のある最も古い月から（点検の登録月より前の月は 0件と誤読されるので出さない）', async () => {
    portalApi.fetchPortalInspections.mockResolvedValue([
      makeInspection({ inspection_id: 'i1', property_name: '物件A', inspection_months: ALL, schedule_from: '2026-09-01' }),
      makeInspection({ inspection_id: 'i2', property_name: '物件B', inspection_months: ALL, schedule_from: '2026-10-01' }),
    ]);
    renderPage();
    await waitFor(() => expect(screen.getByText('物件A')).toBeInTheDocument());
    const options = within(screen.getByRole('combobox', { name: '対象月' })).getAllByRole('option');
    expect(options.map((o) => (o as HTMLOptionElement).value)).toEqual(['2026-10-01', '2026-09-01']);
    expect(screen.getByText(/登録月より前の月は出ません/)).toBeInTheDocument();
    expect(screen.getByText(/点検月の無い点検は報告書が届いた月だけ/)).toBeInTheDocument();
  });

  it('台ごとの点検で2台目だけに完了連絡があっても「完了連絡あり」を出す', async () => {
    portalApi.fetchPortalInspectionUnits.mockResolvedValue([
      { inspection_id: 'i2', unit_id: 'u1', unit_code: 'No1', unit_sort: 0, maintainer_id: 'v1', inspection_months: [], inspected_on: null, equipment_code: null },
      { inspection_id: 'i2', unit_id: 'u2', unit_code: 'No2', unit_sort: 1, maintainer_id: 'v1', inspection_months: [], inspected_on: null, equipment_code: null },
    ]);
    portalApi.fetchNotifyOff.mockResolvedValue([
      { inspection_id: 'i1', unit_id: null },
      { inspection_id: 'i2', unit_id: 'u2' },
    ]);
    formApi.fetchCompletions.mockResolvedValue([
      { property_inspection_id: 'i2', target_month: '2026-10-01', property_unit_id: 'u2' },
    ]);
    renderPage();
    await waitFor(() => expect(screen.getByText('物件B')).toBeInTheDocument());
    expect(within(rowOf('物件B')).getByText('完了連絡あり')).toBeInTheDocument();
  });

  it('読み込みに失敗したら件数を出さず、表は「読み込めませんでした」', async () => {
    portalApi.fetchPortalInspections.mockRejectedValue(new Error('timeout'));
    renderPage();
    await waitFor(() => expect(screen.getByText(/点検の予定を読み込めませんでした/)).toBeInTheDocument());
    expect(screen.getByTestId('report-summary')).toHaveTextContent('—');
    expect(screen.getByText('読み込めませんでした')).toBeInTheDocument();
    expect(screen.queryByText('読み込み中…')).toBeNull();
  });
});
