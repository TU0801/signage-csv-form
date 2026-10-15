import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { ToastProvider } from '@/components/ui/Toast';
import { SingleEntryPage } from '@/pages/SingleEntryPage';
import { PROPERTIES, SETTINGS, TYPES } from './fixtures';
import type { DbVendor } from '@/types/database';

const VENDORS: DbVendor[] = [
  // 名前順の先頭（v1 は一般ユーザーでもこの会社になっていた）
  { id: 'v-first', vendor_name: '㈱IHIﾊﾟｰｷﾝｸﾞｽｸｴｱ', emergency_contact: '03-0000-0000', inspection_type: null, created_at: null },
  { id: 'v-mine', vendor_name: '三菱電機ﾋﾞﾙｿﾘｭｰｼｮﾝｽﾞ㈱', emergency_contact: '0120-000-000', inspection_type: null, created_at: null },
];

const insertEntries = vi.fn();

vi.mock('@/lib/supabase', () => ({ supabase: {}, TABLES: {} }));
vi.mock('@/lib/storage', () => ({
  getPublicUrl: (p: string) => `https://storage/${p}`,
  uploadPosterImage: vi.fn(),
  validateImageFile: vi.fn(),
}));
vi.mock('@/hooks/useAuth', () => ({
  useAuth: () => ({
    user: { id: 'u1' },
    profile: { id: 'u1', role: 'user', vendor_id: 'v-mine' },
    isAdmin: false,
  }),
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
