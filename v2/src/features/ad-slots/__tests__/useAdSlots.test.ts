import { renderHook, act, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { useAdSlots, uploadAdImageV1, adLinkUrlError } from '../hooks/useAdSlots';
import { isSafeLinkUrl } from '@/lib/utils';

const mockSelect = vi.fn();
const mockUpdate = vi.fn();
const mockEq = vi.fn();
const mockOrder = vi.fn();

vi.mock('@/lib/supabase', () => ({
  supabase: {
    from: vi.fn(() => ({
      select: mockSelect,
      update: mockUpdate,
    })),
  },
  TABLES: {
    adSlots: 'signage_ad_slots',
  },
}));

const mockUploadAdImage = vi.fn();
const mockDeleteStorageFile = vi.fn();
vi.mock('@/lib/storage', () => ({
  uploadAdImage: (...args: unknown[]) => mockUploadAdImage(...args),
  deleteStorageFile: (...args: unknown[]) => mockDeleteStorageFile(...args),
}));

/** signage_ad_slots の実列（本番の slot 3 と同じ形） */
const slot3 = {
  id: 's3',
  slot_index: 3,
  image_url:
    'https://pdouwmjyswswfmzpfjzf.supabase.co/storage/v1/object/public/poster-images/ads/slot_3.png',
  caption: '',
  link_url: 'https://baran-ev.com/',
  is_active: false,
  sort_order: 0,
  created_at: null,
  updated_at: null,
};

describe('useAdSlots', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    mockSelect.mockReturnValue({ order: mockOrder });
    mockOrder.mockResolvedValue({ data: [], error: null });
    mockUpdate.mockReturnValue({ eq: mockEq });
    mockEq.mockResolvedValue({ error: null });
    mockDeleteStorageFile.mockResolvedValue(undefined);
  });

  it('fetches slots on mount', async () => {
    const mockSlots = [
      { id: 's1', slot_index: 1, image_url: null, caption: null, link_url: null, is_active: false },
    ];
    mockOrder.mockResolvedValue({ data: mockSlots, error: null });

    const { result } = renderHook(() => useAdSlots());

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.slots).toEqual(mockSlots);
  });

  it('keeps only slots 1-3 (login ads are 3 slots since v1.27.0)', async () => {
    const mockSlots = [1, 2, 3, 4, 7].map((i) => ({
      id: `s${i}`,
      slot_index: i,
      image_url: null,
      caption: null,
      link_url: null,
      is_active: false,
    }));
    mockOrder.mockResolvedValue({ data: mockSlots, error: null });

    const { result } = renderHook(() => useAdSlots());

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.slots.map((s) => s.slot_index)).toEqual([1, 2, 3]);
  });

  it('handles fetch error', async () => {
    mockOrder.mockResolvedValue({ data: null, error: { message: 'DB error' } });

    const { result } = renderHook(() => useAdSlots());

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.error).toBeTruthy();
  });

  it('saveSlot updates image/caption/link/active together by slot_index and keeps the image without a file', async () => {
    const { result } = renderHook(() => useAdSlots());
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      await result.current.saveSlot(slot3, {
        caption: ' 鍵の案内 ',
        linkUrl: 'https://example.com/ ',
        isActive: true,
      });
    });

    expect(mockUploadAdImage).not.toHaveBeenCalled();
    expect(mockUpdate).toHaveBeenCalledWith({
      image_url: slot3.image_url,
      caption: '鍵の案内',
      link_url: 'https://example.com/',
      is_active: true,
      updated_at: expect.any(String),
    });
    expect(mockEq).toHaveBeenCalledWith('slot_index', 3);
  });

  it('saveSlot uploads the chosen image to ads/ first and saves its URL', async () => {
    const newUrl =
      'https://pdouwmjyswswfmzpfjzf.supabase.co/storage/v1/object/public/poster-images/ads/slot_3.jpg';
    mockUploadAdImage.mockResolvedValue(newUrl);
    const file = new File(['x'], 'ad.jpg', { type: 'image/jpeg' });

    const { result } = renderHook(() => useAdSlots());
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      await result.current.saveSlot(slot3, { imageFile: file, caption: '', linkUrl: '', isActive: false });
    });

    expect(mockUploadAdImage).toHaveBeenCalledWith(file, 3);
    // 同じパスへの上書きでも古い画像が出ないよう ?v=<更新時刻> を付ける（updated_at と同じ時刻）
    const saved = mockUpdate.mock.calls[0]![0] as { image_url: string; updated_at: string };
    expect(saved.image_url).toBe(`${newUrl}?v=${Date.parse(saved.updated_at)}`);
  });

  it('saveSlot deletes the old slot file when the extension changes (png -> jpg), and keeps it when it does not', async () => {
    const base = 'https://pdouwmjyswswfmzpfjzf.supabase.co/storage/v1/object/public/poster-images/ads/';
    const { result } = renderHook(() => useAdSlots());
    await waitFor(() => expect(result.current.loading).toBe(false));

    mockUploadAdImage.mockResolvedValue(`${base}slot_3.jpg`);
    await act(async () => {
      await result.current.saveSlot(
        { ...slot3, image_url: `${base}slot_3.png?v=1` },
        { imageFile: new File(['x'], 'slot_3.jpg', { type: 'image/jpeg' }), caption: '', linkUrl: '', isActive: true },
      );
    });
    expect(mockDeleteStorageFile).toHaveBeenCalledWith('ads/slot_3.png');

    mockDeleteStorageFile.mockClear();
    await act(async () => {
      await result.current.saveSlot(
        { ...slot3, image_url: `${base}slot_3.jpg?v=2` },
        { imageFile: new File(['x'], 'slot_3.jpg', { type: 'image/jpeg' }), caption: '', linkUrl: '', isActive: true },
      );
    });
    expect(mockDeleteStorageFile).not.toHaveBeenCalled();
  });

  it('clearSlot empties the row (keeps it) and then deletes ads/slot_{n}.png / .jpg and the current image file', async () => {
    const { result } = renderHook(() => useAdSlots());
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      await result.current.clearSlot({
        ...slot3,
        image_url: 'http://127.0.0.1:55321/storage/v1/object/public/poster-images/ads/ad3.png?v=5',
        caption: '鍵の案内',
        is_active: true,
      });
    });

    expect(mockUpdate).toHaveBeenCalledWith({
      image_url: null,
      caption: '',
      link_url: '',
      is_active: false,
      updated_at: expect.any(String),
    });
    expect(mockEq).toHaveBeenCalledWith('slot_index', 3);
    expect(mockDeleteStorageFile.mock.calls.map((c) => c[0])).toEqual([
      'ads/slot_3.png',
      'ads/slot_3.jpg',
      'ads/ad3.png',
    ]);
    // 行を先に空にする（ファイルの削除に失敗してもログイン画面が消えたファイルを指さない）
    expect(mockUpdate.mock.invocationCallOrder[0]!).toBeLessThan(mockDeleteStorageFile.mock.invocationCallOrder[0]!);
  });

  it('clearSlot does not delete files when the row update fails', async () => {
    mockEq.mockResolvedValue({ error: { message: 'denied' } });
    const { result } = renderHook(() => useAdSlots());
    await waitFor(() => expect(result.current.loading).toBe(false));

    await expect(result.current.clearSlot(slot3)).rejects.toEqual({ message: 'denied' });
    expect(mockDeleteStorageFile).not.toHaveBeenCalled();
  });

  it('saveSlot does not update the row when the upload fails', async () => {
    mockUploadAdImage.mockRejectedValue(new Error('広告画像のアップロードに失敗しました: The resource already exists'));
    const file = new File(['x'], 'ad.png', { type: 'image/png' });

    const { result } = renderHook(() => useAdSlots());
    await waitFor(() => expect(result.current.loading).toBe(false));

    await expect(
      result.current.saveSlot(slot3, { imageFile: file, caption: '', linkUrl: '', isActive: true }),
    ).rejects.toThrow('画像のアップロードに失敗しました: The resource already exists');
    expect(mockUpdate).not.toHaveBeenCalled();
  });
});

describe('uploadAdImageV1', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('rejects other extensions and files over 5MB with the v1 wording before uploading', async () => {
    const gif = new File(['x'], 'ad.gif', { type: 'image/gif' });
    await expect(uploadAdImageV1(gif, 1)).rejects.toThrow('PNG、JPG形式の画像のみアップロードできます');

    const big = new File(['x'], 'big.JPEG', { type: 'image/jpeg' });
    Object.defineProperty(big, 'size', { value: 5 * 1024 * 1024 + 1 });
    await expect(uploadAdImageV1(big, 1)).rejects.toThrow('ファイルサイズは5MB以下にしてください');

    expect(mockUploadAdImage).not.toHaveBeenCalled();
  });
});

describe('adLinkUrlError', () => {
  it('accepts empty and http(s) URLs and rejects ones without a scheme (they become relative links)', () => {
    expect(adLinkUrlError('')).toBeNull();
    expect(adLinkUrlError(' https://baran-ev.com/ ')).toBeNull();
    expect(adLinkUrlError('http://example.com')).toBeNull();
    expect(adLinkUrlError('www.example.com')).toBe('https:// または http:// から始まるURLを入力してください');
  });
});

describe('広告リンクの安全確認', () => {
  it('javascript: 等は保存させず、ログイン画面でもリンクにしない', () => {
    expect(adLinkUrlError(' JavaScript:alert(1)')).not.toBeNull();
    expect(adLinkUrlError('data:text/html,x')).not.toBeNull();
    expect(isSafeLinkUrl('javascript:alert(1)')).toBe(false);
    expect(isSafeLinkUrl('//evil.example')).toBe(false);
    expect(isSafeLinkUrl('https://example.com')).toBe(true);
    expect(isSafeLinkUrl('/login')).toBe(true);
  });
});
