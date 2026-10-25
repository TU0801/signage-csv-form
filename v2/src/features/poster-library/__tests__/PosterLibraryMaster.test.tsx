import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { useAuthStore } from '@/stores/authStore';
import type { PosterLibraryRow } from '@/lib/api/poster-library';

vi.mock('@/lib/supabase', () => ({ SUPABASE_URL: 'https://example.supabase.co', supabase: {}, TABLES: {}, RPC: {} }));
vi.mock('@/components/ui/Toast', () => ({ useToast: () => ({ addToast: vi.fn() }) }));
const pdf = vi.hoisted(() => ({ preparePosterImage: vi.fn(async (f: File) => ({ file: f, notice: null })) }));
vi.mock('@/lib/pdfToPng', () => pdf);
vi.mock('@/lib/api/portal', () => ({ fetchManagementCompanies: async () => [] }));
vi.mock('@/lib/api/users', () => ({ fetchOwnManagementCompany: async () => [{ id: 'c-own', name: '自社管理' }] }));
const api = vi.hoisted(() => ({
  fetchLibraryRows: vi.fn(),
  createLibraryItem: vi.fn(),
  updateLibraryItem: vi.fn(),
}));
vi.mock('@/lib/api/poster-library', async (orig) => ({
  ...(await orig<typeof import('@/lib/api/poster-library')>()),
  ...api,
}));

import { PosterLibraryMaster } from '../components/PosterLibraryMaster';

const URL_OF = (p: string) => `https://example.supabase.co/storage/v1/object/public/poster-images/${p}`;
const row = (over: Partial<PosterLibraryRow>): PosterLibraryRow => ({
  id: 'r',
  display_name: '騒音注意',
  category: '注意',
  image_url: URL_OF('library/common/a.png'),
  storage_path: 'library/common/a.png',
  management_company_id: null,
  sort_order: 0,
  is_active: true,
  created_by: null,
  created_at: '2026-10-25T00:00:00Z',
  updated_at: '2026-10-25T00:00:00Z',
  ...over,
});

describe('マスター管理の貼紙ライブラリ（修正依頼1025 D2）', () => {
  beforeEach(() => {
    HTMLDialogElement.prototype.showModal ??= function (this: HTMLDialogElement) {
      this.open = true;
    };
    HTMLDialogElement.prototype.close ??= function (this: HTMLDialogElement) {
      this.open = false;
    };
    vi.clearAllMocks();
    useAuthStore.setState({
      profile: { id: 'm1', email: 'm@x', company_name: null, role: 'management', vendor_id: null, management_company_id: 'c-own', status: 'active', created_at: null, updated_at: null },
    } as never);
  });

  it('管理会社は全社共通を閲覧だけにし、自社の分を登録できる（対象は自社に固定）', async () => {
    api.fetchLibraryRows.mockResolvedValue([
      row({ id: 'common', display_name: '騒音注意' }),
      row({ id: 'own', display_name: '駐車禁止', management_company_id: 'c-own', storage_path: 'library/c-own/b.png', image_url: URL_OF('library/c-own/b.png') }),
    ]);
    api.createLibraryItem.mockResolvedValue(row({ id: 'new' }));
    render(<PosterLibraryMaster />);

    const commonRow = (await screen.findByText('騒音注意')).closest('tr')!;
    expect(within(commonRow).getByText('閲覧のみ')).toBeInTheDocument();
    const ownRow = screen.getByText('駐車禁止').closest('tr')!;
    expect(within(ownRow).getByRole('button', { name: '無効にする' })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: '＋貼紙を登録' }));
    const scope = await screen.findByLabelText('対象（どの物件の申請で選べるか）');
    await waitFor(() => expect(scope).toHaveValue('c-own'));
    expect(scope).toBeDisabled();
    const png = new File(['x'], '立入禁止.png', { type: 'image/png' });
    fireEvent.change(screen.getByLabelText('貼紙ライブラリの画像'), { target: { files: [png] } });
    await waitFor(() => expect(screen.getByLabelText('名前')).toHaveValue('立入禁止'));
    fireEvent.click(screen.getByRole('button', { name: '登録' }));
    await waitFor(() =>
      expect(api.createLibraryItem).toHaveBeenCalledWith(
        { display_name: '立入禁止', category: 'その他', sort_order: 0, management_company_id: 'c-own' },
        png,
      ),
    );
  });
});
