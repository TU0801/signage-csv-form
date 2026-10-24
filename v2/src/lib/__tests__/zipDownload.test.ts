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
vi.mock('file-saver', () => ({ saveAs: vi.fn() }));

import { downloadCustomImages } from '../zipDownload';

const entry = (id: string, status: DbEntry['status']): DbEntry =>
  ({
    id,
    status,
    property_code: 'P1',
    inspection_type: '追加画像',
    poster_type: 'custom',
    poster_image: `https://x.test/${id}.png`,
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
    expect(zipLog.files).toEqual(['P1_追加画像_bbbbbbbb.jpg']);

    zipLog.files = [];
    expect(await downloadCustomImages(entries, 'all')).toBe(3);
    expect(zipLog.files).toEqual([
      'P1_追加画像_aaaaaaaa.jpg',
      'P1_追加画像_bbbbbbbb.jpg',
      'P1_追加画像_cccccccc.jpg',
    ]);
    fetchSpy.mockRestore();
  });
});
