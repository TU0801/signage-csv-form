import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { ToastProvider } from '@/components/ui/Toast';
import { HeaderSlotContext } from '@/components/layout/HeaderSlot';
import { SingleEntryPage } from '@/pages/SingleEntryPage';
import { PROPERTIES, SETTINGS, TYPES } from './fixtures';
import type { DbVendor } from '@/types/database';

const VENDORS: DbVendor[] = [
  // 名前順の先頭（v1 は一般ユーザーでもこの会社になっていた）
  { id: 'v-first', vendor_name: '㈱IHIﾊﾟｰｷﾝｸﾞｽｸｴｱ', emergency_contact: '03-0000-0000', inspection_type: null, created_at: null },
  { id: 'v-mine', vendor_name: '三菱電機ﾋﾞﾙｿﾘｭｰｼｮﾝｽﾞ㈱', emergency_contact: '0120-000-000', inspection_type: null, created_at: null },
];

const insertEntries = vi.fn();
let isAdmin = false;

vi.mock('@/lib/supabase', () => ({ supabase: {}, TABLES: {} }));
vi.mock('@/lib/storage', () => ({
  getPublicUrl: (p: string) => `https://storage/${p}`,
  uploadPosterImage: vi.fn(),
  validateImageFile: vi.fn(),
}));
vi.mock('@/hooks/useAuth', () => ({
  useAuth: () => ({
    user: { id: 'u1' },
    profile: { id: 'u1', role: isAdmin ? 'admin' : 'user', vendor_id: isAdmin ? null : 'v-mine' },
    isAdmin,
  }),
}));
vi.mock('@/lib/api/masterData', () => ({
  fetchPropertyManagementCompanies: () =>
    Promise.resolve([
      { property_code: '120273-00', management_company_id: 'c-en', management_company_name: '株式会社えん建物管理' },
      { property_code: '2010', management_company_id: null, management_company_name: null },
    ]),
}));
vi.mock('@/hooks/useMasterData', () => ({
  useMasterData: () => ({
    properties: PROPERTIES,
    vendors: VENDORS,
    inspectionTypes: TYPES,
    categories: [],
    templateImages: [],
    loading: false,
    error: null,
  }),
}));
vi.mock('@/lib/api/relationships', () => ({ fetchActivePropertyCodes: vi.fn() }));
vi.mock('@/lib/api/single-entry', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/api/single-entry')>();
  return {
    ...actual,
    fetchAppSettings: () => Promise.resolve(SETTINGS),
    fetchLinkedInspectionIds: () => Promise.resolve(new Set(['clean'])),
    fetchMyEntriesThisMonth: () => Promise.resolve([]),
    insertEntries: (...args: unknown[]) => insertEntries(...args),
  };
});

beforeEach(() => {
  // jsdom には <dialog> の showModal / close が無い（ConfirmDialog が使う）
  HTMLDialogElement.prototype.showModal ??= function () {};
  HTMLDialogElement.prototype.close ??= function () {};
  isAdmin = false;
  insertEntries.mockReset();
  insertEntries.mockResolvedValue([]);
});

describe('1件入力画面（一般ユーザー）', () => {
  // 記録する保守会社は v1 と同じく社名順の先頭（v1 index.html:363 の #vendor = 0。ユーザー決定 2026-10-15）。紐付けは自社で読む
  it('自社の紐付けを反映し、v1 と同じく社名順の先頭の保守会社で未設置物件の案内を申請できる', async () => {
    render(
      <ToastProvider>
        <SingleEntryPage />
      </ToastProvider>,
    );

    // 紐付けが1カテゴリ（清掃）だけなので、カテゴリと先頭の紐付け点検種別が選ばれる（v1 applyLinkedDefaults）
    await waitFor(() => expect(screen.getByLabelText('案内カテゴリ')).toHaveValue('清掃'));
    expect(screen.getByLabelText('点検工事案内 *')).toHaveValue('clean');

    fireEvent.change(screen.getByLabelText('物件コード', { exact: false, selector: 'select' }), {
      target: { value: 'z0015A01' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'データを追加' }));
    const table = await screen.findByRole('table');
    expect(within(table).getByText('z0015A01')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: '申請する' }));
    await waitFor(() => expect(insertEntries).toHaveBeenCalledTimes(1));
    const rows = insertEntries.mock.calls[0]![0] as Record<string, unknown>[];
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      user_id: 'u1',
      property_code: 'z0015A01',
      terminal_id: '',
      vendor_name: '㈱IHIﾊﾟｰｷﾝｸﾞｽｸｴｱ',
      inspection_type: '排水管清掃',
      display_duration: 10,
      status: 'draft',
    });
  });
});

describe('1件入力画面（管理者の管理会社フィルター）', () => {
  it('既定は全て。管理会社で物件の選択肢を絞り、外れた物件の選択を外す。未設定には業務システムに無い物件も入る', async () => {
    isAdmin = true;
    render(
      <HeaderSlotContext.Provider value={{ target: document.body, setTarget: () => {} }}>
        <ToastProvider>
          <SingleEntryPage />
        </ToastProvider>
      </HeaderSlotContext.Provider>,
    );

    const filter = await screen.findByLabelText('管理会社');
    expect(filter).toHaveValue('');
    const propertySelect = screen.getByLabelText('物件コード', { exact: false, selector: 'select' });
    const codes = () =>
      within(propertySelect)
        .getAllByRole('option')
        .map((o) => (o as HTMLOptionElement).value)
        .filter(Boolean);
    expect(codes()).toEqual(['2010', '120273-00', 'z0015A01']);

    fireEvent.change(filter, { target: { value: 'c-en' } });
    expect(codes()).toEqual(['120273-00']);

    // 選択は state で確かめる（選択肢に無い値は DOM 上は空に見えるため、端末ID の選択肢で見る）
    fireEvent.change(propertySelect, { target: { value: '120273-00' } });
    const terminalSelect = screen.getByLabelText('端末ID', { exact: false, selector: 'select' });
    expect(terminalSelect).toHaveValue('h0001A00');
    fireEvent.change(filter, { target: { value: '__none__' } });
    expect(codes()).toEqual(['2010', 'z0015A01']);
    expect(terminalSelect).not.toHaveValue('h0001A00');
  });
});
