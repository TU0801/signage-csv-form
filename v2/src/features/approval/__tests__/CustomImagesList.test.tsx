import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { DbEntry } from '@/types/database';

vi.mock('@/lib/supabase', () => ({
  SUPABASE_URL: 'https://example.supabase.co',
  supabase: {},
  TABLES: {},
}));
vi.mock('@/components/ui/Toast', () => ({ useToast: () => ({ addToast: vi.fn() }) }));
vi.mock('@/features/entries-list/hooks/useEntryLookups', () => ({
  useEntryLookups: () => ({ propertyNames: new Map([['120409-00', '検証マンション']]) }),
}));
const zip = vi.hoisted(() => ({
  downloadCustomImages: vi.fn(async () => 1),
  downloadCustomImage: vi.fn(async () => {}),
}));
vi.mock('@/lib/zipDownload', () => zip);

const SAFE = 'https://example.supabase.co/storage/v1/object/public/poster-images/u1/a.png';
const entry = (over: Partial<DbEntry>): DbEntry =>
  ({
    id: 'x',
    property_code: '120409-00',
    inspection_type: '追加画像',
    vendor_name: '保守A',
    poster_type: 'custom',
    poster_image: SAFE,
    status: 'ready',
    inspection_start: '2026-11-01',
    inspection_end: '2026-11-02',
    created_at: '2026-10-01T00:00:00Z',
    ...over,
  }) as DbEntry;

const rows = vi.hoisted(() => ({ value: [] as DbEntry[] }));
vi.mock('@/lib/api/custom-images', async (orig) => ({
  ...(await orig<typeof import('@/lib/api/custom-images')>()),
  fetchCustomImageEntries: async () => rows.value,
}));

import { sortCustomImageEntries } from '@/lib/api/custom-images';
import { CustomImagesList } from '../components/CustomImagesList';

beforeEach(() => vi.clearAllMocks());

describe('追加登録された画像', () => {
  it('承認待ち（draft）を先頭に、同じ状態の中は新しい順に並べる', () => {
    const sorted = sortCustomImageEntries([
      entry({ id: 'old-ready', status: 'ready', created_at: '2026-10-01T00:00:00Z' }),
      entry({ id: 'draft', status: 'draft', created_at: '2026-09-01T00:00:00Z' }),
      entry({ id: 'new-ready', status: 'ready', created_at: '2026-10-05T00:00:00Z' }),
    ]);
    expect(sorted.map((e) => e.id)).toEqual(['draft', 'new-ready', 'old-ready']);
  });

  it('このプロジェクトの poster-images 以外の URL は表示もダウンロードもしない。まとめて DL は状態を問わず渡す', async () => {
    rows.value = [
      entry({ id: 'ok', status: 'draft' }),
      entry({ id: 'bad', poster_image: 'javascript:alert(1)', property_code: 'z0015A01' }),
    ];
    render(<CustomImagesList />);
    expect(await screen.findByText('検証マンション')).toBeInTheDocument();
    expect(screen.getByText('承認待ち')).toBeInTheDocument();
    expect(screen.getAllByText('2026/11/01〜2026/11/02')).toHaveLength(2);
    expect(screen.getByText('表示できない URL')).toBeInTheDocument();
    expect(screen.getAllByRole('img')).toHaveLength(1);

    fireEvent.click(screen.getByRole('button', { name: 'まとめてDL' }));
    await waitFor(() => expect(zip.downloadCustomImages).toHaveBeenCalledTimes(1));
    expect(zip.downloadCustomImages).toHaveBeenCalledWith([rows.value[0]], 'all');

    fireEvent.click(
      screen.getByRole('button', { name: '120409-00 追加画像 の画像をダウンロード' }),
    );
    await waitFor(() => expect(zip.downloadCustomImage).toHaveBeenCalledWith(rows.value[0]));
    expect(
      screen.getByRole('button', { name: 'z0015A01 追加画像 の画像をダウンロード' }),
    ).toBeDisabled();
  });
});
