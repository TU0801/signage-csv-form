import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockRpc = vi.fn();
vi.mock('@/lib/supabase', () => ({
  supabase: { rpc: (...args: unknown[]) => mockRpc(...args) },
  TABLES: {},
  RPC: {
    inspectionTypeOptionsForRequest: 'inspection_type_options_for_request',
    approvePropertyRequest: 'approve_property_request',
  },
}));

import { approvePropertyRequest, fetchInspectionTypeOptionsForRequest } from '../property-requests';

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

describe('approvePropertyRequest（新規建物の承認）', () => {
  beforeEach(() => mockRpc.mockReset());

  it('端末番号が空なら p_terminal_id を送らず（DB 更新前の 2引数版でも通る）、入れたときだけ送る', async () => {
    mockRpc.mockResolvedValue({ data: { id: 'r1' }, error: null });
    await approvePropertyRequest('r1', ' 120410 ', '  ');
    expect(mockRpc).toHaveBeenLastCalledWith('approve_property_request', {
      p_id: 'r1',
      p_property_code: '120410',
    });
    await approvePropertyRequest('r1', '120410', ' z0090A01 ');
    expect(mockRpc).toHaveBeenLastCalledWith('approve_property_request', {
      p_id: 'r1',
      p_property_code: '120410',
      p_terminal_id: 'z0090A01',
    });
  });
});
