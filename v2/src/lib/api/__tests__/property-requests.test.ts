import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockRpc = vi.fn();
vi.mock('@/lib/supabase', () => ({
  supabase: { rpc: (...args: unknown[]) => mockRpc(...args) },
  TABLES: {},
  RPC: { inspectionTypeOptionsForRequest: 'inspection_type_options_for_request' },
}));

import { fetchInspectionTypeOptionsForRequest } from '../property-requests';

describe('fetchInspectionTypeOptionsForRequest（建物追加 申請の点検種別）', () => {
  beforeEach(() => mockRpc.mockReset());

  it('DB が返した有効な点検種別を並び順のまま使い、先頭（＝既定）は無効な種別を飛ばした後の1つ目になる', async () => {
    // 無効な「機械式駐車場点検」（sort 1）は DB が外すので、先頭は sort 2 の種別
    mockRpc.mockResolvedValue({
      data: [
        { id: 't2', name: '機械式駐車場工事', linked: true },
        { id: 't3', name: '消防設備点検', linked: true },
      ],
      error: null,
    });
    const result = await fetchInspectionTypeOptionsForRequest('v1');
    expect(mockRpc).toHaveBeenCalledWith('inspection_type_options_for_request', {
      p_vendor_id: 'v1',
    });
    expect(result).toEqual({
      options: [
        { id: 't2', name: '機械式駐車場工事' },
        { id: 't3', name: '消防設備点検' },
      ],
      linked: true,
    });

    // 紐付けが無いと全点検種別（linked=false）
    mockRpc.mockResolvedValue({ data: [{ id: 't9', name: '全体', linked: false }], error: null });
    expect((await fetchInspectionTypeOptionsForRequest('v2')).linked).toBe(false);
  });
});
