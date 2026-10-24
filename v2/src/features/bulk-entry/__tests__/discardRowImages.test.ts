import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { useBulkStore, resetBulkSession } from '@/stores/bulkStore';
import { discardUnheldRowImages, rowPosterImages } from '../utils/discardRowImages';
import { TEMPLATE_STORAGE_KEY } from '../utils/bulkTemplates';
import { createMemoryStorage } from './memoryStorage';

const io = vi.hoisted(() => ({ discardOwnPosterImages: vi.fn() }));
vi.mock('@/lib/supabase', () => ({ supabase: {}, TABLES: {}, RPC: {} }));
vi.mock('@/lib/storage', () => ({ discardOwnPosterImages: io.discardOwnPosterImages }));

const IMG = (n: string) => `https://storage/poster-images/user-1/${n}.png`;

describe('一括入力の行を消したときの画像の片付け', () => {
  beforeEach(() => {
    vi.stubGlobal('localStorage', createMemoryStorage());
    resetBulkSession();
    io.discardOwnPosterImages.mockReset();
  });
  afterEach(() => vi.unstubAllGlobals());

  it('消した行の画像のうち、残る行・コピー中の行・保存したテンプレートが持つものは消さない', () => {
    const store = useBulkStore.getState();
    store.setUserId('user-1');
    const a = store.addRow({ posterType: 'custom', posterImage: IMG('a') });
    const b = store.addRow({ posterType: 'custom', posterImage: IMG('b') });
    const c = store.addRow({ posterType: 'custom', posterImage: IMG('c') });
    const d = store.addRow({ posterType: 'custom', posterImage: IMG('d') });
    store.addRow({ posterType: 'custom', posterImage: IMG('a') }); // a を複製した行
    store.copyRow(b);
    localStorage.setItem(
      TEMPLATE_STORAGE_KEY,
      JSON.stringify([{ id: 't', name: 'T', vendorId: null, vendorName: null, createdAt: 1, rows: [{ posterType: 'custom', posterImage: IMG('c') }] }]),
    );

    const ids = [a, b, c, d];
    const images = rowPosterImages(useBulkStore.getState().rows.filter((r) => ids.includes(r.id)));
    store.removeRows(ids);
    discardUnheldRowImages(images);

    expect(io.discardOwnPosterImages).toHaveBeenCalledWith([IMG('d')], 'user-1');
  });
});
