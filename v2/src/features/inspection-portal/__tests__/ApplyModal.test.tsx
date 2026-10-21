import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { DEFAULT_APP_SETTINGS } from '@/lib/api/single-entry';
import type { MasterData } from '@/types/app';
import { makeEntry, makeInspection } from './fixtures';

const api = vi.hoisted(() => ({ insertEntries: vi.fn(async () => []) }));
vi.mock('@/lib/api/single-entry', async (orig) => ({
  ...(await orig<typeof import('@/lib/api/single-entry')>()),
  insertEntries: api.insertEntries,
}));
const entryApi = vi.hoisted(() => ({ fetchEntryForEdit: vi.fn(), resubmitEntry: vi.fn(async () => ({})) }));
vi.mock('../lib/entryApi', () => entryApi);
vi.mock('@/lib/supabase', () => ({ supabase: {}, TABLES: {}, RPC: {}, BUCKETS: {} }));
vi.mock('@/lib/storage', () => ({ getPublicUrl: (p: string) => `https://storage/${p}` }));
vi.mock('@/features/single-entry/hooks/useAppSettings', async () => {
  const { DEFAULT_APP_SETTINGS: s } = await import('@/lib/api/single-entry');
  return { useAppSettings: () => s };
});
const master = vi.hoisted(() => ({ value: null as unknown as MasterData & { loading: boolean; error: null } }));
vi.mock('@/hooks/useMasterData', () => ({ useMasterData: () => master.value }));
// トーストは同じ関数を返す（本物の addToast は安定している）
const toast = vi.hoisted(() => ({ addToast: vi.fn() }));
vi.mock('@/components/ui/Toast', () => ({ useToast: () => toast }));

import { ApplyModal } from '../components/ApplyModal';

beforeEach(() => {
  vi.clearAllMocks();
  // jsdom の <dialog> は showModal/close を持たない。開いた状態にして中身を読めるようにする
  HTMLDialogElement.prototype.showModal ??= function (this: HTMLDialogElement) {
    this.open = true;
  };
  HTMLDialogElement.prototype.close ??= function (this: HTMLDialogElement) {
    this.open = false;
  };
  master.value = {
    loading: false,
    error: null,
    properties: [
      {
        id: 'p1',
        property_code: '900001-00',
        property_name: 'テスト第一マンション',
        terminals: [{ terminal_id: 'T-1' }, { terminal_id: 'T-2' }] as never,
        inspections: [],
      },
    ],
    // 1件入力の vendors[0] 方式なら先頭（別会社）が選ばれてしまう並び
    vendors: [
      { id: 'v0', vendor_name: '別の保守', emergency_contact: '000', inspection_type: null, created_at: null },
      { id: 'v1', vendor_name: 'テスト保守', emergency_contact: '03-0000-0000', inspection_type: null, created_at: null },
    ],
    inspectionTypes: [
      {
        id: 't1',
        inspection_name: 'エレベーター定期点検',
        template_no: 'elevator_inspection',
        template_image: null,
        default_text: 'エレベーターの点検を行います。',
        category_id: null,
        category: '点検',
        show_on_board: true,
        sort_order: 1,
        created_at: null,
      },
    ],
    categories: [],
    templateImages: [],
  };
});

describe('ApplyModal（点検ポータルの申請）', () => {
  it('点検行の保守会社・対象月・点検行 ID を付けて draft で INSERT する', async () => {
    const onApplied = vi.fn();
    render(
      <ApplyModal
        target={{ inspection: makeInspection(), targetMonth: '2026-11-01', resubmit: null }}
        onClose={vi.fn()}
        onApplied={onApplied}
        userId="admin-1"
        isAdmin
        profileVendorId={null}
      />,
    );
    // 案内文は点検種別の既定文で埋まっている
    expect(screen.getByLabelText('案内文')).toHaveValue('エレベーターの点検を行います。');
    fireEvent.change(screen.getByLabelText('点検開始日 *'), { target: { value: '2026-11-10' } });
    fireEvent.click(screen.getByRole('button', { name: '申請する' }));

    await waitFor(() => expect(api.insertEntries).toHaveBeenCalledTimes(1));
    const [rows] = api.insertEntries.mock.calls[0] as unknown as [Record<string, unknown>[]];
    expect(rows[0]).toMatchObject({
      user_id: 'admin-1',
      property_code: '900001-00',
      terminal_id: 'T-1',
      vendor_name: 'テスト保守',
      emergency_contact: '03-0000-0000',
      inspection_type: 'エレベーター定期点検',
      template_no: 'elevator_inspection',
      inspection_start: '2026-11-10',
      inspection_end: '2026-11-10',
      display_start_date: '2026-11-10',
      announcement: 'エレベーターの点検を行います。',
      status: 'draft',
      property_inspection_id: 'i1',
      vendor_id: 'v1',
      target_month: '2026-11-01',
      display_duration: DEFAULT_APP_SETTINGS.display_time_default,
    });
    expect(onApplied).toHaveBeenCalled();
  });

  it('点検開始日が空なら申請しない', () => {
    render(
      <ApplyModal
        target={{ inspection: makeInspection(), targetMonth: '2026-11-01', resubmit: null }}
        onClose={vi.fn()}
        onApplied={vi.fn()}
        userId="u1"
        isAdmin={false}
        profileVendorId="v1"
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: '申請する' }));
    expect(toast.addToast).toHaveBeenCalledWith('点検開始日を入力してください', 'error');
    expect(api.insertEntries).not.toHaveBeenCalled();
  });

  it('差戻しの再申請は同じ申請を draft へ更新する（理由を見せ、今の値を読み込む）', async () => {
    entryApi.fetchEntryForEdit.mockResolvedValue({
      id: 'e9',
      terminal_id: 'T-2',
      inspection_start: '2026-11-03',
      // 終了日を省いた申請も DB には開始日と同じ日が入る（buildApplyRow）。日付を後ろへずらして直せること
      inspection_end: '2026-11-03',
      announcement: '直す前の案内文',
      remarks: '',
      display_start_date: '2026-11-03',
      display_end_date: '2026-11-03',
      target_month: '2026-11-01',
    });
    const sentBack = makeEntry({ id: 'e9', status: 'pending', review_comment: '日付が違います' });
    render(
      <ApplyModal
        target={{ inspection: makeInspection(), targetMonth: '2026-11-01', resubmit: sentBack }}
        onClose={vi.fn()}
        onApplied={vi.fn()}
        userId="u1"
        isAdmin={false}
        profileVendorId="v1"
      />,
    );
    expect(await screen.findByLabelText('点検開始日 *')).toHaveValue('2026-11-03');
    expect(screen.getByText('日付が違います')).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('点検開始日 *'), { target: { value: '2026-11-12' } });
    fireEvent.click(screen.getByRole('button', { name: '再申請する' }));

    await waitFor(() => expect(entryApi.resubmitEntry).toHaveBeenCalledTimes(1));
    const [id, patch] = entryApi.resubmitEntry.mock.calls[0] as unknown as [string, Record<string, unknown>];
    expect(id).toBe('e9');
    expect(patch).toMatchObject({ status: 'draft', inspection_start: '2026-11-12', inspection_end: '2026-11-12', terminal_id: 'T-2', vendor_id: 'v1' });
    expect(patch).not.toHaveProperty('user_id');
    expect(api.insertEntries).not.toHaveBeenCalled();
  });
});
