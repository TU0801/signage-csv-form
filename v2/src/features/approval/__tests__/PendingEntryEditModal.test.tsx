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
/** 範囲の点検行（物件 2010。山田エレベーター＝V1 の点検 3つと、別の会社の点検 1つ） */
const insp = (id: string, label: string, vendor: string, units: string[] = []) => ({
  inspection_id: id,
  property_code: '2010-00',
  property_name: 'エクレスト六本松',
  terminal_count: 1,
  terminal_ids: [],
  management_company_id: null,
  management_company_name: null,
  inspection_type_id: id,
  inspection_type_label: label,
  template_no: null,
  vendor_id: vendor,
  vendor_name: null,
  unit_vendor_ids: units,
  inspection_months: [],
  schedule_from: '2026-01-01',
  remarks: '',
});
const SCOPE = {
  inspections: [
    insp('i-ev', 'エレベーター定期点検', 'V1'),
    insp('i-fire', '消防設備点検', 'V2', ['V1']),
    insp('i-none', 'テンプレート無し点検', 'V1'),
    insp('i-other', 'インターホン点検', 'V2'),
  ],
  units: [{ inspection_id: 'i-fire', unit_id: 'u-1', unit_code: 'No1', unit_sort: 1, maintainer_id: 'V1', inspection_months: [], inspected_on: null, equipment_code: null }],
};

const TYPES = [
  type('エレベーター定期点検', 'elevator_inspection', 'エレベーターが止まります。'),
  type('消防設備点検', 'fire_inspection', '火災報知器が鳴ります。'),
  type('テンプレート無し点検', '', ''),
  type('インターホン点検', 'intercom', ''),
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
      vendors={[{ id: 'V1', vendor_name: '山田エレベーター', emergency_contact: '' }]}
      typeScope={SCOPE}
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

  it('テンプレートNoの無い点検種別に変えると保存・承認を止め、点検予定に紐付いた申請は種別が申請時と違うと知らせる', () => {
    open({ property_inspection_id: '2b84a9bd-b98e-4332-bd19-2973387bc13c' });
    fireEvent.change(screen.getByLabelText('点検種別'), { target: { value: 'テンプレート無し点検' } });
    expect(screen.getByText(/紐付けを「テンプレート無し点検」の点検へ付け替えます/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '保存して承認' }));
    fireEvent.click(screen.getByRole('button', { name: '保存' }));
    expect(api.updatePendingEntry).not.toHaveBeenCalled();
    expect(toast.addToast).toHaveBeenCalledWith(expect.stringContaining('テンプレートNoがありません'), 'error');
  });

  it('点検種別は申請の保守会社がその物件で担当する種別だけ選べる（修正依頼1029 決定④。保守会社名から引く旧来の申請も同じ）', () => {
    open({ vendor_id: null });
    const options = [...(screen.getByLabelText('点検種別') as HTMLSelectElement).options].map((o) => o.value);
    expect(options).toEqual(['エレベーター定期点検', '消防設備点検', 'テンプレート無し点検']);
  });

  it('点検に紐付いた申請で点検種別を変えると、紐付けをその種別の点検へ付け替え、台はその点検に同じ台があれば残す（修正依頼1029）', async () => {
    open({ property_inspection_id: 'i-ev', vendor_id: 'V1', property_unit_id: 'u-1' });
    fireEvent.change(screen.getByLabelText('点検種別'), { target: { value: '消防設備点検' } });
    fireEvent.click(screen.getByRole('button', { name: '保存' }));
    await waitFor(() => expect(api.updatePendingEntry).toHaveBeenCalledTimes(1));
    expect(api.updatePendingEntry).toHaveBeenCalledWith(
      '11111111-aaaa-4bbb-8ccc-000000000001',
      expect.objectContaining({ inspection_type: '消防設備点検', template_no: 'fire_inspection', property_inspection_id: 'i-fire' }),
      '2026-10-26T00:00:00+00:00',
    );
    const [, patch] = api.updatePendingEntry.mock.calls[0] as unknown as [string, Record<string, unknown>];
    expect(patch).not.toHaveProperty('property_unit_id');
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
