import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/supabase', () => ({
  SUPABASE_URL: 'https://abc.supabase.co',
  SUPABASE_ANON_KEY: 'anon-key',
  TABLES: { errorLogs: 'signage_error_logs' },
}));

import { createMemoryStorage } from '@/features/bulk-entry/__tests__/memoryStorage';
import { logError } from '../errorLog';

const SESSION_KEY = 'sb-abc-auth-token';

describe('logError（signage_error_logs への保存）', () => {
  const fetchMock = vi.fn(async () => new Response(null, { status: 201 }));
  beforeEach(() => {
    vi.stubGlobal('fetch', fetchMock);
    vi.stubGlobal('localStorage', createMemoryStorage());
    fetchMock.mockClear();
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('ログインしていない（保存済みのセッションが無い）ときは送らない（RLS で必ず弾かれ、連番だけ進むため）', () => {
    logError(new Error('ログアウト直後の失敗'), 'test');
    expect(fetchMock).not.toHaveBeenCalled();

    localStorage.setItem(SESSION_KEY, JSON.stringify({ access_token: 'user-token', user: { id: 'u1' } }));
    logError(new Error('ログイン中の失敗'), 'test');
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer user-token');
  });
});
