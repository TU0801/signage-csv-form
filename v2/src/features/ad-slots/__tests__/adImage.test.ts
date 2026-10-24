import { describe, it, expect } from 'vitest';
import { adOutputFormat, sourceTypeFromUrl, storagePathFromPublicUrl, withCacheBuster } from '../lib/adImage';

const PUBLIC = 'https://pdouwmjyswswfmzpfjzf.supabase.co/storage/v1/object/public/poster-images/';

describe('広告画像の切り抜きの補助', () => {
  it('元が PNG なら PNG、それ以外（JPEG など）は JPEG で書き出す', () => {
    expect(adOutputFormat('image/png')).toEqual({ type: 'image/png', ext: 'png' });
    expect(adOutputFormat('image/jpeg')).toEqual({ type: 'image/jpeg', ext: 'jpg' });
    expect(adOutputFormat('')).toEqual({ type: 'image/jpeg', ext: 'jpg' });
    // 保存済みの画像は URL の拡張子で判断する（?v= は見ない）
    expect(sourceTypeFromUrl(`${PUBLIC}ads/slot_1.png?v=1`)).toBe('image/png');
    expect(sourceTypeFromUrl(`${PUBLIC}ads/slot_2.jpg`)).toBe('image/jpeg');
  });

  it('公開 URL から poster-images 内のパスを取り出し（?v= は外す）、?v= を付け替える', () => {
    expect(storagePathFromPublicUrl(`${PUBLIC}ads/slot_3.png?v=1729`)).toBe('ads/slot_3.png');
    expect(storagePathFromPublicUrl('https://example.com/a.png')).toBeNull();
    expect(storagePathFromPublicUrl(null)).toBeNull();
    expect(withCacheBuster(`${PUBLIC}ads/slot_3.png?v=1`, 2)).toBe(`${PUBLIC}ads/slot_3.png?v=2`);
  });
});
