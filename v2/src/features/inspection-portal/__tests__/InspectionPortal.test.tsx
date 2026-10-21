import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, within, waitFor } from '@testing-library/react';
import { makeEntry, makeInspection } from './fixtures';

const portal = vi.hoisted(() => ({
  fetchPortalInspections: vi.fn(),
  fetchPortalEntries: vi.fn(),
  fetchInspectionReports: vi.fn(),
  reviewEntry: vi.fn(async () => ({})),
}));
vi.mock('@/lib/api/portal', () => portal);
const auth = vi.hoisted(() => ({
  value: { user: { id: 'u1' }, isAdmin: false, isManagement: false, vendorId: 'v1' as string | null },
}));
vi.mock('@/hooks/useAuth', () => ({ useAuth: () => auth.value }));
const toast = vi.hoisted(() => ({ addToast: vi.fn() }));
vi.mock('@/components/ui/Toast', () => ({ useToast: () => toast }));
// 申請・報告書のモーダルはそれぞれのテストで見る（ここではマスタを読ませない）
vi.mock('../components/ApplyModal', () => ({ ApplyModal: () => null }));
const upload = vi.hoisted(() => ({ props: null as null | { open: boolean; targetMonth: string | null; entryId?: string | null } }));
vi.mock('@/features/inspection-documents/components/ReportUploadModal', () => ({
  ReportUploadModal: (p: { open: boolean; targetMonth: string | null; entryId?: string | null }) => {
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

  it('管理会社には承認・差戻しだけを出し、承認で reviewEntry を呼ぶ', async () => {
    auth.value = { user: { id: 'm-user' }, isAdmin: false, isManagement: true, vendorId: null };
    render(<InspectionPortal />);
    await screen.findByText('点検一覧');
    expect(screen.queryByRole('button', { name: '申請' })).toBeNull();
    expect(screen.queryByRole('button', { name: '報告書' })).toBeNull();
    expect(screen.queryByLabelText('管理会社')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: '承認' }));
    await waitFor(() => expect(portal.reviewEntry).toHaveBeenCalledWith('e1', 'approve'));
    expect(screen.getByRole('button', { name: '差戻し' })).toBeInTheDocument();
  });
});
