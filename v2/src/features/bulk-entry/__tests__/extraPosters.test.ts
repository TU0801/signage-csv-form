import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { useBulkStore, resetBulkSession } from '@/stores/bulkStore';
import { CSV_HEADERS } from '@/lib/csv';
import { generateBulkCsv } from '../utils/bulkCsv';
import { discardUnheldRowImages, rowPosterImages } from '../utils/discardRowImages';
import { DEFAULT_BULK_SETTINGS } from '../utils/bulkMaster';
import type { BulkMasterData } from '../types';
import { createMemoryStorage } from './memoryStorage';

const io = vi.hoisted(() => ({ discardOwnPosterImages: vi.fn() }));
vi.mock('@/lib/supabase', () => ({ supabase: {}, TABLES: {}, RPC: {} }));
vi.mock('@/lib/storage', () => ({ discardOwnPosterImages: io.discardOwnPosterImages }));

const IMG = (n: string) => `https://storage/poster-images/user-1/${n}.png`;

const master: BulkMasterData = {
  properties: [{ propertyCode: 'z0001A01', propertyName: '物件A', terminalId: 'T-A1', supplement: '' }],
  vendors: [{ id: 'v1', vendorName: 'A社', emergencyContact: '092-000-0000' }],
  notices: [{ inspectionType: '消防設備点検', templateNo: 'fire', noticeText: '点検中です' }],
};

describe('一括入力の2枚目以降の貼紙（修正依頼1025 D3）', () => {
  beforeEach(() => {
    vi.stubGlobal('localStorage', createMemoryStorage());
    resetBulkSession();
    io.discardOwnPosterImages.mockReset();
    const store = useBulkStore.getState();
    store.setUserId('user-1');
    store.setMasterData(master);
    store.setCurrentVendor({ id: 'v1', name: 'A社' });
  });
  afterEach(() => vi.unstubAllGlobals());

  it('一括入力の CSV は2枚目以降を同じ物件・端末の「追加」の行に展開する（点検案内TPLNo は画像のファイル名）', () => {
    const store = useBulkStore.getState();
    store.addRow({
      propertyCode: 'z0001A01',
      inspectionType: '消防設備点検',
      startDate: '2026-11-02',
      endDate: '2026-11-03',
      extraPosters: [{ image_url: IMG('extra'), source: 'upload', position: '4' }],
    });
    const s = useBulkStore.getState();
    const lines = generateBulkCsv(s.rows, s.masterData, s.currentVendor, DEFAULT_BULK_SETTINGS).split('\n');
    expect(lines).toHaveLength(3);
    const col = (line: string, name: (typeof CSV_HEADERS)[number]) => line.split(',')[CSV_HEADERS.indexOf(name)];
    expect(col(lines[1]!, '貼紙区分')).toBe('テンプレート');
    expect(col(lines[2]!, '貼紙区分')).toBe('追加');
    expect(col(lines[2]!, '物件コード')).toBe('z0001A01');
    expect(col(lines[2]!, '端末ID')).toBe('T-A1');
    expect(col(lines[2]!, '点検案内TPLNo')).toBe('extra');
    expect(col(lines[2]!, '点検工事案内')).toBe('');
    expect(col(lines[2]!, 'frame_No')).toBe('4');
  });

  it('行を消したときの片付けは2枚目以降の画像も対象にし、ほかの行が持つ2枚目以降の画像は残す', () => {
    const store = useBulkStore.getState();
    const a = store.addRow({ extraPosters: [{ image_url: IMG('x1'), source: 'upload' }, { image_url: IMG('x2'), source: 'upload' }] });
    store.addRow({ extraPosters: [{ image_url: IMG('x2'), source: 'upload' }] });
    const images = rowPosterImages(useBulkStore.getState().rows.filter((r) => r.id === a));
    expect(images).toEqual([IMG('x1'), IMG('x2')]);
    store.removeRows([a]);
    discardUnheldRowImages(images);
    expect(io.discardOwnPosterImages).toHaveBeenCalledWith([IMG('x1')], 'user-1');
  });
});
