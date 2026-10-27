import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { makeEntry } from '@/features/entries-list/__tests__/fixtures';
import type { DbInspectionType } from '@/types/database';

const api = vi.hoisted(() => ({ updatePendingEntry: vi.fn(async () => ({})) }));
vi.mock('@/lib/api/admin-entries', () => ({
  updatePendingEntry: api.updatePendingEntry,
  entryErrorReason: (e: unknown) => (e instanceof Error ? e.message : '理由'),
}));
vi.mock('@/lib/supabase', () => ({ supabase: {}, TABLES: {}, RPC: {}, SUPABASE_URL: 'https://example.supabase.co' }));
vi.mock('@/lib/storage', () => ({ uploadPosterImage: vi.fn(), discardOwnPosterImages: vi.fn() }));
vi.mock('@/lib/pdfToPng', () => ({ preparePosterImage: vi.fn() }));
vi.mock('@/lib/templateStorage', () => ({ templateFileUrl: (f: string) => `https://storage/templates/${f}` }));
vi.mock('@/features/entries-list/hooks/useEntriesFilters', () => ({ applyDefaultStartDate: vi.fn() }));
const toast = vi.hoisted(() => ({ addToast: vi.fn() }));
vi.mock('@/components/ui/Toast', () => ({ useToast: () => toast }));

import { PendingEntryEditModal } from '../components/PendingEntryEditModal';

const type = (name: string, templateNo: string, text: string): DbInspectionType => ({
  id: name,
  inspection_name: name,
  template_no: templateNo,
  template_image: null,
  default_text: text,
  category_id: null,
  category: null,
  show_on_board: true,
  sort_order: 1,
  created_at: null,
});
const TYPES = [
  type('エレベーター定期点検', 'elevator_inspection', 'エレベーターが止まります。'),
  type('消防設備点検', 'fire_inspection', '火災報知器が鳴ります。'),
];

function open(over = {}) {
  const onSaved = vi.fn();
  const onClose = vi.fn();
  const entry = makeEntry({
    status: 'draft',
    inspection_type: 'エレベーター定期点検',
    template_no: 'elevator_inspection',
    announcement: 'エレベーターが止まります。',
    memo: '点検月を変更',
    updated_at: '2026-10-26T00:00:00+00:00',
    ...over,
  });
  render(
    <PendingEntryEditModal
      entry={entry}
      onClose={onClose}
      onSaved={onSaved}
      userId="admin-1"
      propertyNames={new Map([['2010', 'エクレスト六本松']])}
      emailOf={() => 'mitsubishi@EV'}
      inspectionTypes={TYPES}
      templateImages={[]}
      vendors={[]}
      displayDefault={6}
    />,
  );
  return { onSaved, onClose, entry };
}

beforeEach(() => {
  vi.clearAllMocks();
  HTMLDialogElement.prototype.showModal ??= function (this: HTMLDialogElement) {
    this.open = true;
  };
  HTMLDialogElement.prototype.close ??= function (this: HTMLDialogElement) {
    this.open = false;
  };
});

describe('PendingEntryEditModal（承認待ちの編集を基本フォームで。修正依頼1027 決定③）', () => {
  it('ステータス・テンプレートNo・メモ・点検種別・登録者と登録日時を出す', () => {
    open();
    expect(screen.getByTestId('entry-status')).toHaveTextContent('承認待ち');
    expect(screen.getByTestId('template-no')).toHaveTextContent('elevator_inspection');
    expect(screen.getByLabelText('メモ（CSV外）')).toHaveValue('点検月を変更');
    expect(screen.getByLabelText('点検種別')).toHaveValue('エレベーター定期点検');
    expect(screen.getByTestId('registrant')).toHaveTextContent('mitsubishi@EV');
    expect(screen.getByTestId('registrant')).toHaveTextContent(/2026\/10\/1/);
  });

  it('点検種別を変えるとテンプレートNoも変わり、既定文のままの案内文は新しい既定文になる。保存は変えた列だけを版つきで送る', async () => {
    const { onSaved } = open();
    fireEvent.change(screen.getByLabelText('点検種別'), { target: { value: '消防設備点検' } });
    expect(screen.getByTestId('template-no')).toHaveTextContent('fire_inspection');
    expect(screen.getByLabelText('掲示板用案内文')).toHaveValue('火災報知器が鳴ります。');
    fireEvent.click(screen.getByRole('button', { name: '保存' }));

    await waitFor(() => expect(api.updatePendingEntry).toHaveBeenCalledTimes(1));
    expect(api.updatePendingEntry).toHaveBeenCalledWith(
      '11111111-aaaa-4bbb-8ccc-000000000001',
      { inspection_type: '消防設備点検', template_no: 'fire_inspection', announcement: '火災報知器が鳴ります。' },
      '2026-10-26T00:00:00+00:00',
    );
    expect(onSaved).toHaveBeenCalled();
  });

  it('「保存して承認」は同じ更新で状態を承認済み（ready）にする（版は開いたときの updated_at）', async () => {
    open();
    fireEvent.change(screen.getByLabelText('メモ（CSV外）'), { target: { value: '' } });
    fireEvent.click(screen.getByRole('button', { name: '保存して承認' }));
    await waitFor(() => expect(api.updatePendingEntry).toHaveBeenCalledTimes(1));
    expect(api.updatePendingEntry).toHaveBeenCalledWith(
      '11111111-aaaa-4bbb-8ccc-000000000001',
      { memo: null, status: 'ready' },
      '2026-10-26T00:00:00+00:00',
    );
  });

  it('建物未承認の申請は「保存して承認」を押せない', () => {
    render(
      <PendingEntryEditModal
        entry={makeEntry({ status: 'draft' })}
        onClose={vi.fn()}
        onSaved={vi.fn()}
        userId="admin-1"
        propertyNames={new Map()}
        emailOf={() => '-'}
        inspectionTypes={TYPES}
        templateImages={[]}
        vendors={[]}
        displayDefault={6}
        approveBlockedReason="建物が承認されるまで承認できません"
      />,
    );
    expect(screen.getByRole('button', { name: '保存して承認' })).toBeDisabled();
  });
});
