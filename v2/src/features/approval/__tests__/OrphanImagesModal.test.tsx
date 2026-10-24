import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import type { OrphanPosterImage } from '@/lib/api/custom-images';

vi.mock('@/lib/supabase', () => ({ SUPABASE_URL: 'https://example.supabase.co', supabase: {}, TABLES: {}, RPC: {} }));
const toast = vi.hoisted(() => ({ addToast: vi.fn() }));
vi.mock('@/components/ui/Toast', () => ({ useToast: () => toast }));
vi.mock('@/features/entries-list/hooks/useEntryLookups', () => ({ useEntryLookups: () => ({ propertyNames: new Map() }) }));
const api = vi.hoisted(() => ({ fetchOrphanPosterImages: vi.fn(), fetchCustomImageEntries: vi.fn(async () => []) }));
vi.mock('@/lib/api/custom-images', async (orig) => ({
  ...(await orig<typeof import('@/lib/api/custom-images')>()),
  fetchOrphanPosterImages: api.fetchOrphanPosterImages,
  fetchCustomImageEntries: api.fetchCustomImageEntries,
}));
const storage = vi.hoisted(() => ({ deletePosterObjects: vi.fn() }));
vi.mock('@/lib/storage', () => ({
  getPublicUrl: (p: string) => `https://example.supabase.co/storage/v1/object/public/poster-images/${p}`,
  deletePosterObjects: storage.deletePosterObjects,
}));

import { OrphanImagesModal } from '../components/OrphanImagesModal';
import { CustomImagesList } from '../components/CustomImagesList';

const item = (name: string, size: number): OrphanPosterImage => ({
  name,
  size,
  mimetype: 'image/png',
  created_at: '2026-09-29T13:38:17Z',
  owner_id: 'u1',
  owner_email: 'user@verify.local',
  owner_company: '検証エレベーター保守株式会社',
});

beforeEach(() => {
  vi.clearAllMocks();
  HTMLDialogElement.prototype.showModal ??= function (this: HTMLDialogElement) {
    this.open = true;
  };
  HTMLDialogElement.prototype.close ??= function (this: HTMLDialogElement) {
    this.open = false;
  };
});

describe('使われていない画像を整理', () => {
  it('件数・合計サイズ・サムネイルを出し、確認のあと、消す直前に取り直した一覧にまだある画像だけ消す', async () => {
    api.fetchOrphanPosterImages
      .mockResolvedValueOnce([item('u1/a.png', 1024 * 1024), item('u1/b.png', 512 * 1024)])
      // 確かめている間に b が申請で使われた
      .mockResolvedValueOnce([item('u1/a.png', 1024 * 1024)])
      .mockResolvedValue([]);
    storage.deletePosterObjects.mockResolvedValue(['u1/a.png']);
    render(<OrphanImagesModal open onClose={() => {}} />);

    expect(await screen.findByTestId('orphan-summary')).toHaveTextContent('2件・合計 1.5 MB');
    expect(screen.getByAltText('u1/a.png のサムネイル')).toHaveAttribute(
      'src',
      'https://example.supabase.co/storage/v1/object/public/poster-images/u1/a.png',
    );
    expect(storage.deletePosterObjects).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: '2件を削除', hidden: true }));
    const confirm = screen.getByText(/2件（合計 1\.5 MB）の画像を削除します/).closest('dialog')!;
    fireEvent.click(within(confirm).getByRole('button', { name: '削除', hidden: true }));

    await waitFor(() => expect(storage.deletePosterObjects).toHaveBeenCalledWith(['u1/a.png']));
    await waitFor(() =>
      expect(toast.addToast).toHaveBeenCalledWith(expect.stringContaining('1件の画像を削除しました（1件は'), 'success'),
    );
  });

  it('整理のボタンは管理者だけに出す（管理会社にも同じタブが開くため）', async () => {
    const { unmount } = render(<CustomImagesList />);
    await waitFor(() => expect(api.fetchCustomImageEntries).toHaveBeenCalled());
    expect(screen.queryByRole('button', { name: '使われていない画像を整理' })).toBeNull();
    unmount();
    render(<CustomImagesList canCleanup />);
    expect(await screen.findByRole('button', { name: '使われていない画像を整理' })).toBeInTheDocument();
  });
});
