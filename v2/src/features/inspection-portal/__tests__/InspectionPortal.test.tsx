import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render as rtlRender, screen, fireEvent, within, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import type { ReactElement } from 'react';
import { makeEntry, makeInspection } from './fixtures';
import { makeReport } from '@/features/inspection-documents/__tests__/fixtures';

const portal = vi.hoisted(() => ({
  fetchPortalInspections: vi.fn(),
  fetchPortalEntries: vi.fn(),
  fetchInspectionReports: vi.fn(),
  reviewEntry: vi.fn(async () => ({})),
}));
vi.mock('@/lib/api/portal', () => portal);
vi.mock('@/lib/supabase', () => ({ supabase: {}, TABLES: {}, RPC: {}, BUCKETS: {}, SUPABASE_URL: 'https://example.invalid' }));
const auth = vi.hoisted(() => ({
  value: { user: { id: 'u1' }, isAdmin: false, isManagement: false, vendorId: 'v1' as string | null },
}));
vi.mock('@/hooks/useAuth', () => ({ useAuth: () => auth.value }));
const toast = vi.hoisted(() => ({ addToast: vi.fn() }));
vi.mock('@/components/ui/Toast', () => ({ useToast: () => toast }));
// 申請・報告書のモーダルはそれぞれのテストで見る（ここではマスタを読ませない）
vi.mock('../components/ApplyModal', () => ({ ApplyModal: () => null }));
type UploadProps = { open: boolean; targetMonth: string | null; entryId?: string | null; previous?: { id: string } | null };
const upload = vi.hoisted(() => ({ props: null as null | UploadProps }));
vi.mock('@/features/inspection-documents/components/ReportUploadModal', () => ({
  ReportUploadModal: (p: UploadProps) => {
    upload.props = p;
    return null;
  },
}));

import { InspectionPortal } from '../components/InspectionPortal';

beforeEach(() => {
  vi.clearAllMocks();
  auth.value = { user: { id: 'u1' }, isAdmin: false, isManagement: false, vendorId: 'v1' };
  vi.useFakeTimers({ toFake: ['Date'] });
  // 日本時間 2026-10-21
  vi.setSystemTime(new Date('2026-10-21T03:00:00Z'));
  // jsdom の <dialog> は showModal/close を持たない。開いた状態にして中身を読めるようにする
  HTMLDialogElement.prototype.showModal ??= function (this: HTMLDialogElement) {
    this.open = true;
  };
  HTMLDialogElement.prototype.close ??= function (this: HTMLDialogElement) {
    this.open = false;
  };
  portal.fetchPortalInspections.mockResolvedValue([
    // 5月は超過（未申請）、11月は承認待ち
    makeInspection(),
    makeInspection({
      inspection_id: 'i2',
      property_code: '900002-00',
      property_name: 'テスト第二マンション',
      inspection_months: [11],
    }),
  ]);
  portal.fetchPortalEntries.mockResolvedValue([makeEntry({ id: 'e1', property_inspection_id: 'i1' })]);
  portal.fetchInspectionReports.mockResolvedValue([]);
});
afterEach(() => vi.useRealTimers());

// 報告書のセルは点検報告書の画面へのリンク（Router が要る）
const render = (ui: ReactElement) => rtlRender(<MemoryRouter>{ui}</MemoryRouter>);
const rows = () => screen.getAllByTestId('schedule-row');

describe('点検一覧（InspectionPortal）', () => {
  it('件数バッジを押すと、その条件の行だけになる', async () => {
    render(<InspectionPortal />);
    await screen.findByText('点検一覧');
    expect(rows()).toHaveLength(3);
    fireEvent.click(screen.getByRole('button', { name: /点検月を過ぎて未申請\s*1/ }));
    expect(rows()).toHaveLength(1);
    expect(within(rows()[0]!).getByText('点検月超過')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /承認待ち\s*1/ }));
    expect(rows()).toHaveLength(1);
    expect(within(rows()[0]!).getByText('申請済み（承認待ち）')).toBeInTheDocument();
    // もう一度押すと外れ、時期も既定に戻る
    fireEvent.click(screen.getByRole('button', { name: /承認待ち\s*1/ }));
    expect(rows()).toHaveLength(3);
    expect(screen.getByLabelText('時期')).toHaveValue('default');
  });

  it('点検月が未登録の点検の報告書には、別の月の申請を紐付けない', async () => {
    portal.fetchPortalInspections.mockResolvedValue([makeInspection({ inspection_months: [] })]);
    // 6月分の申請（承認待ち）がある。報告書は実施日の月になるので、この申請は紐付けない
    portal.fetchPortalEntries.mockResolvedValue([makeEntry({ id: 'e9', target_month: '2026-06-01' })]);
    render(<InspectionPortal />);
    const row = await screen.findByTestId('unscheduled-row');
    fireEvent.click(within(row).getByText('報告書'));
    expect(upload.props).toMatchObject({ open: true, targetMonth: null, entryId: null });
  });

  it('受領済みの版がある月の報告書は、置き換わる前の版として渡す', async () => {
    // DB は同じ点検・対象月の版を superseded にするので、受領済みでも「前の版」の注意を出す
    portal.fetchInspectionReports.mockResolvedValue([
      makeReport({ id: 'r5', property_inspection_id: 'i1', target_month: '2026-05-01', status: 'accepted' }),
    ]);
    render(<InspectionPortal />);
    await screen.findByText('点検一覧');
    const may = rows().find((r) => r.textContent?.includes('2026年5月'))!;
    fireEvent.click(within(may).getByRole('button', { name: '報告書' }));
    expect(upload.props).toMatchObject({ open: true, targetMonth: '2026-05-01', previous: { id: 'r5' } });
  });

  it('保守会社には申請・報告書を出し、承認・差戻しは出さない', async () => {
    render(<InspectionPortal />);
    await screen.findByText('点検一覧');
    expect(screen.getAllByRole('button', { name: '申請' }).length).toBeGreaterThan(0);
    expect(screen.getAllByRole('button', { name: '報告書' })).toHaveLength(3);
    expect(screen.queryByRole('button', { name: '承認' })).toBeNull();
    expect(screen.queryByRole('button', { name: '差戻し' })).toBeNull();
    // 保守会社のアカウントには会社の絞り込みを出さない
    expect(screen.queryByLabelText('保守会社')).toBeNull();
  });

  it('管理会社には承認・差戻しだけを出し、内容を開いて確認を経てから承認する', async () => {
    auth.value = { user: { id: 'm-user' }, isAdmin: false, isManagement: true, vendorId: null };
    portal.fetchPortalEntries.mockResolvedValue([
      makeEntry({
        id: 'e1',
        announcement: 'エレベーターが止まります',
        remarks: '掲示の備考',
        terminal_id: 'T001',
        display_start_date: '2026-11-03',
        display_start_time: '09:00',
        display_end_date: '2026-11-10',
        display_end_time: '18:00',
        poster_type: 'custom',
        poster_image: 'https://example.invalid/storage/v1/object/public/poster-images/u1/poster.png',
      }),
    ]);
    render(<InspectionPortal />);
    await screen.findByText('点検一覧');
    expect(screen.queryByRole('button', { name: '申請' })).toBeNull();
    expect(screen.queryByRole('button', { name: '報告書' })).toBeNull();
    expect(screen.queryByLabelText('管理会社')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: '内容を確認して承認' }));
    expect(screen.getByText('エレベーターが止まります')).toBeInTheDocument();
    expect(screen.getByText('掲示の備考')).toBeInTheDocument();
    expect(screen.getByText('2026/11/03 09:00〜2026/11/10 18:00')).toBeInTheDocument();
    expect(screen.getByAltText('追加画像')).toHaveAttribute('src', 'https://example.invalid/storage/v1/object/public/poster-images/u1/poster.png');
    expect(screen.getByRole('button', { name: '差戻し' })).toBeInTheDocument();
    // 承認は確認ダイアログを経る
    fireEvent.click(screen.getByRole('button', { name: '承認' }));
    expect(portal.reviewEntry).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: '承認する' }));
    await waitFor(() => expect(portal.reviewEntry).toHaveBeenCalledWith('e1', 'approve'));
  });

  it('点検月の無い点検: 過去に承認済みの申請があっても、新しい申請を承認の対象にする', async () => {
    auth.value = { user: { id: 'm-user' }, isAdmin: false, isManagement: true, vendorId: null };
    portal.fetchPortalInspections.mockResolvedValue([makeInspection({ inspection_months: [] })]);
    portal.fetchPortalEntries.mockResolvedValue([
      makeEntry({ id: 'e-new', status: 'draft', target_month: '2026-11-01', created_at: '2026-10-20T00:00:00Z' }),
      makeEntry({ id: 'e-old', status: 'ready', target_month: '2026-05-01', created_at: '2026-04-20T00:00:00Z' }),
    ]);
    render(<InspectionPortal />);
    const row = await screen.findByTestId('unscheduled-row');
    expect(within(row).getByText('申請済み（承認待ち）')).toBeInTheDocument();
    expect(within(row).getByText(/2026年11月分/)).toBeInTheDocument();
    fireEvent.click(within(row).getByRole('button', { name: '内容を確認して承認' }));
    fireEvent.click(screen.getByRole('button', { name: '承認' }));
    fireEvent.click(screen.getByRole('button', { name: '承認する' }));
    await waitFor(() => expect(portal.reviewEntry).toHaveBeenCalledWith('e-new', 'approve'));
  });

  it('件数バッジと申請状況の絞り込みは点検月の無い点検も対象にし、該当があれば開いて出す', async () => {
    portal.fetchPortalInspections.mockResolvedValue([
      makeInspection(),
      makeInspection({ inspection_id: 'i3', property_code: '900003-00', property_name: 'テスト第三マンション', inspection_months: [] }),
      makeInspection({ inspection_id: 'i4', property_code: '900004-00', property_name: 'テスト第四マンション', inspection_months: [] }),
    ]);
    portal.fetchPortalEntries.mockResolvedValue([
      makeEntry({ id: 'e1', property_inspection_id: 'i1' }),
      makeEntry({ id: 'e3', property_inspection_id: 'i3', property_code: '900003-00' }),
    ]);
    render(<InspectionPortal />);
    await screen.findByText('点検一覧');
    const details = screen.getAllByTestId('unscheduled-row')[0]!.closest('details')!;
    expect(details.open).toBe(false);
    fireEvent.click(screen.getByRole('button', { name: /承認待ち\s*2/ }));
    const unscheduled = screen.getAllByTestId('unscheduled-row');
    expect(unscheduled).toHaveLength(1);
    expect(within(unscheduled[0]!).getByText('テスト第三マンション')).toBeInTheDocument();
    expect(unscheduled[0]!.closest('details')!.open).toBe(true);
  });

  it('報告書のセルは、その報告書に絞った点検報告書の画面へのリンク', async () => {
    portal.fetchInspectionReports.mockResolvedValue([
      makeReport({ id: 'r7', property_inspection_id: 'i1', target_month: '2026-11-01', status: 'submitted' }),
    ]);
    render(<InspectionPortal />);
    await screen.findByText('点検一覧');
    expect(screen.getByRole('link', { name: /確認待ち/ })).toHaveAttribute('href', '/portal/documents?report=r7');
  });

  it('承認済みの行の操作は「承認を取り消して差戻し」（内容を開いてから理由を聞く）', async () => {
    auth.value = { user: { id: 'm-user' }, isAdmin: false, isManagement: true, vendorId: null };
    portal.fetchPortalEntries.mockResolvedValue([makeEntry({ id: 'e1', status: 'ready' })]);
    render(<InspectionPortal />);
    await screen.findByText('点検一覧');
    // 行のボタンは内容を開き、そこから理由を聞くダイアログへ進む
    fireEvent.click(screen.getByRole('button', { name: '承認を取り消して差戻し' }));
    expect(screen.getByText('申請の内容')).toBeInTheDocument();
    fireEvent.click(within(screen.getByText('申請の内容').closest('dialog')!).getByRole('button', { name: '承認を取り消して差戻し' }));
    expect(screen.getByText('申請の差戻し')).toBeInTheDocument();
  });

  it('読み込みに失敗したら理由と再読み込みを出す', async () => {
    portal.fetchPortalEntries.mockRejectedValueOnce({ message: '接続が切れました' });
    render(<InspectionPortal />);
    expect(await screen.findByText('点検一覧を読み込めませんでした（接続が切れました）')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '再読み込み' }));
    expect(await screen.findByText('点検一覧')).toBeInTheDocument();
  });
});
