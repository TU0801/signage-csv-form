import { describe, expect, it, vi } from 'vitest';

const invoke = vi.fn();
vi.mock('@/lib/supabase', () => ({
  supabase: { functions: { invoke: (...args: unknown[]) => invoke(...args) } },
  BUCKETS: {},
  EDGE_FUNCTIONS: { aiOcr: 'signage-ai-ocr' },
  RPC: {},
  TABLES: {},
}));

import { AI_OCR_NOT_CONFIGURED, fetchAiOcrStatus } from '../property-files';

describe('fetchAiOcrStatus（修正依頼1104 本番確認: 状態を確かめられなかったときは「未設定」と言わない）', () => {
  it('キーが無いと言われたときだけ「未設定」、関数の失敗（401 など）は理由を出す', async () => {
    invoke.mockResolvedValueOnce({ data: { configured: false }, error: null });
    expect(await fetchAiOcrStatus()).toEqual({ configured: false, message: AI_OCR_NOT_CONFIGURED });

    invoke.mockResolvedValueOnce({ data: null, error: new Error('ログインが必要です') });
    const failed = await fetchAiOcrStatus();
    expect(failed.configured).toBe(false);
    expect(failed.message).toBe('AI-OCR の状態を確かめられませんでした（ログインが必要です）。画面を読み込み直してください');

    // supabase-js の英語の定型文は出さない
    invoke.mockResolvedValueOnce({ data: null, error: new Error('Failed to send a request to the Edge Function') });
    expect((await fetchAiOcrStatus()).message).toBe('AI-OCR の状態を確かめられませんでした（通信に失敗しました）。画面を読み込み直してください');

    invoke.mockResolvedValueOnce({ data: { configured: true }, error: null });
    expect(await fetchAiOcrStatus()).toEqual({ configured: true, message: null });
  });
});
