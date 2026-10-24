import { describe, it, expect, vi } from 'vitest';
import type { DbEntry } from '@/types/database';

const zipLog = vi.hoisted(() => ({ files: [] as string[] }));
vi.mock('jszip', () => ({
  default: class {
    file(name: string) {
      zipLog.files.push(name);
    }
    async generateAsync() {
      return new Blob(['zip']);
    }
  },
}));
const saver = vi.hoisted(() => ({ saveAs: vi.fn() }));
vi.mock('file-saver', () => saver);
vi.mock('@/lib/supabase', () => ({ SUPABASE_URL: 'https://example.supabase.co', supabase: {} }));

const POSTER_BASE = 'https://example.supabase.co/storage/v1/object/public/poster-images/';

import { downloadCustomImage, downloadCustomImages } from '../zipDownload';

const entry = (id: string, status: DbEntry['status'], posterImage = `${POSTER_BASE}u1/${id}.png`): DbEntry =>
  ({
    id,
    status,
    property_code: 'P1',
    inspection_type: '追加画像',
    poster_type: 'custom',
    poster_image: posterImage,
  }) as DbEntry;

describe('downloadCustomImages の状態引数', () => {
  it("既定は承認済みだけ、'all' なら承認待ち・未申請も含める", async () => {
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockImplementation(async () => new Response(new Blob(['img'])));
    const entries = [
      entry('aaaaaaaa1', 'draft'),
      entry('bbbbbbbb1', 'ready'),
      entry('cccccccc1', 'pending'),
    ];

    zipLog.files = [];
    expect(await downloadCustomImages(entries)).toBe(1);
    expect(zipLog.files).toEqual(['P1_追加画像_bbbbbbbb.png']);

    zipLog.files = [];
    expect(await downloadCustomImages(entries, 'all')).toBe(3);
    expect(zipLog.files).toEqual([
      'P1_追加画像_aaaaaaaa.png',
      'P1_追加画像_bbbbbbbb.png',
      'P1_追加画像_cccccccc.png',
    ]);
    fetchSpy.mockRestore();
  });

  it('このプロジェクトの poster-images 以外の URL は取りに行かず、ZIP にも数えない', async () => {
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockImplementation(async () => new Response(new Blob(['img'])));
    const entries = [
      entry('aaaaaaaa1', 'ready'),
      entry('bbbbbbbb1', 'ready', 'javascript:alert(1)'),
      entry('cccccccc1', 'ready', 'https://evil.test/storage/v1/object/public/poster-images/x.png'),
    ];
    zipLog.files = [];
    expect(await downloadCustomImages(entries)).toBe(1);
    expect(zipLog.files).toEqual(['P1_追加画像_aaaaaaaa.png']);
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(fetchSpy).toHaveBeenCalledWith(`${POSTER_BASE}u1/aaaaaaaa1.png`);
    fetchSpy.mockRestore();
  });
});

describe('追加画像のファイル名の拡張子（修正依頼1024 本番確認 ④）', () => {
  const PNG_BYTES = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0]);
  const JPG_BYTES = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0]);

  it('URL の拡張子に合わせ、URL に拡張子が無ければ中身の先頭バイトで .png/.jpg を付ける（ZIP・個別 DL とも）', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const url = String(input);
      return new Response(url.includes('noext-png') ? PNG_BYTES : JPG_BYTES);
    });
    const entries = [
      entry('aaaaaaaa1', 'ready', `${POSTER_BASE}u1/a.png?t=1`),
      entry('bbbbbbbb1', 'ready', `${POSTER_BASE}u1/b.jpeg`),
      entry('cccccccc1', 'ready', `${POSTER_BASE}u1/noext-png`),
      entry('dddddddd1', 'ready', `${POSTER_BASE}u1/noext-jpg`),
    ];
    zipLog.files = [];
    expect(await downloadCustomImages(entries)).toBe(4);
    expect(zipLog.files).toEqual([
      'P1_追加画像_aaaaaaaa.png',
      'P1_追加画像_bbbbbbbb.jpg',
      'P1_追加画像_cccccccc.png',
      'P1_追加画像_dddddddd.jpg',
    ]);

    saver.saveAs.mockClear();
    await downloadCustomImage(entries[0]!);
    await downloadCustomImage(entries[2]!);
    expect(saver.saveAs.mock.calls.map((c) => c[1])).toEqual(['P1_追加画像_aaaaaaaa.png', 'P1_追加画像_cccccccc.png']);
    fetchSpy.mockRestore();
  });
});
