import { describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/supabase', () => ({ SUPABASE_URL: 'https://example.supabase.co', supabase: {} }));

const { safePosterUrl } = await import('../posterUrl');

describe('safePosterUrl', () => {
  it('このプロジェクトの poster-images の公開 URL だけを通す', () => {
    const ok = 'https://example.supabase.co/storage/v1/object/public/poster-images/u1/a.png';
    expect(safePosterUrl(ok)).toBe(ok);
    expect(safePosterUrl('javascript:alert(1)')).toBeNull();
    expect(safePosterUrl('https://evil.example.com/storage/v1/object/public/poster-images/a.png')).toBeNull();
    expect(safePosterUrl('https://example.supabase.co/storage/v1/object/public/other/a.png')).toBeNull();
    expect(safePosterUrl(null)).toBeNull();
  });
});
