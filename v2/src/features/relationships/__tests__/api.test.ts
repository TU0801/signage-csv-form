import { describe, it, expect, vi, beforeEach } from 'vitest';

// supabase のクエリビルダーを模す: 呼ばれたメソッドと引数を記録し、await で result を返す
const calls: { method: string; args: unknown[] }[] = [];
let result: { data: unknown; error: unknown } = { data: [], error: null };

function builder(): Record<string, unknown> {
  const b: Record<string, unknown> = {};
  for (const m of ['select', 'insert', 'update', 'delete', 'eq', 'in', 'order', 'single']) {
    b[m] = (...args: unknown[]) => {
      calls.push({ method: m, args });
      return b;
    };
  }
  b.then = (resolve: (v: unknown) => unknown) => resolve(result);
  return b;
}

vi.mock('@/lib/supabase', () => ({
  supabase: {
    from: (table: string) => {
      calls.push({ method: 'from', args: [table] });
      return builder();
    },
  },
  TABLES: {
    buildingVendors: 'signage_building_vendors',
    vendorInspections: 'signage_vendor_inspections',
    profiles: 'signage_profiles',
  },
}));

import {
  approveBuildingRequest,
  availablePropertiesForVendor,
  fetchVendorInspections,
  rejectBuildingRequest,
  removeVendorInspection,
  summarizeAddResults,
} from '../api';

const methods = () => calls.map((c) => c.method);
const argsOf = (m: string) => calls.filter((c) => c.method === m).map((c) => c.args);

describe('relationships api', () => {
  beforeEach(() => {
    calls.length = 0;
    result = { data: [], error: null };
  });

  it('点検種別の紐付けは active だけを取得する', async () => {
    result = {
      data: [
        {
          id: 'vi1',
          vendor_id: 'v1',
          inspection_id: 'i1',
          status: 'active',
          created_at: '2026-03-01T00:00:00Z',
          updated_at: '2026-03-01T00:00:00Z',
          signage_master_inspection_types: { inspection_name: '消防設備点検', category: '点検' },
        },
      ],
      error: null,
    };
    const rows = await fetchVendorInspections('v1');
    expect(argsOf('from')).toEqual([['signage_vendor_inspections']]);
    expect(argsOf('eq')).toEqual([
      ['vendor_id', 'v1'],
      ['status', 'active'],
    ]);
    expect(rows[0]?.signage_master_inspection_types?.inspection_name).toBe('消防設備点検');
  });

  it('点検種別の紐付けの解除は status=inactive の更新で、行は消さない', async () => {
    result = { data: { id: 'vi1', status: 'inactive' }, error: null };
    await removeVendorInspection('vi1');
    expect(methods()).not.toContain('delete');
    expect(argsOf('update')).toEqual([[{ status: 'inactive' }]]);
    expect(argsOf('eq')).toEqual([['id', 'vi1']]);
  });

  it('ビル追加リクエストの承認は active と approved_by を入れ、却下は物理削除する', async () => {
    result = { data: { id: 'bv1', status: 'active' }, error: null };
    await approveBuildingRequest('bv1', 'admin-uid');
    expect(argsOf('update')).toEqual([[{ status: 'active', approved_by: 'admin-uid' }]]);

    calls.length = 0;
    result = { data: null, error: null };
    await rejectBuildingRequest('bv2');
    expect(methods()).toEqual(['from', 'delete', 'eq']);
    expect(argsOf('eq')).toEqual([['id', 'bv2']]);
  });

  it('追加モーダルの物件は active / pending を除き、解除済みは候補に戻し、物件コードで1つにまとめる', () => {
    const props = [
      { property_code: '100', property_name: 'A' },
      { property_code: '200', property_name: 'B' },
      { property_code: '300', property_name: 'C' },
      { property_code: '400', property_name: 'D' },
      { property_code: '400', property_name: 'D' },
    ];
    const linked = [
      { property_code: '100', status: 'active' as const },
      { property_code: '200', status: 'pending' as const },
      { property_code: '300', status: 'deleted' as const },
    ];
    expect(availablePropertiesForVendor(props, linked).map((p) => p.property_code)).toEqual([
      '300',
      '400',
    ]);
  });

  it('複数追加の結果を v1 と同じ文言にまとめる', () => {
    const ok = { status: 'fulfilled', value: {} } as const;
    const ng = (message: string) => ({ status: 'rejected', reason: new Error(message) }) as const;
    expect(summarizeAddResults([ok, ok], '物件')).toEqual({
      type: 'success',
      message: '2件の物件を追加しました',
    });
    expect(summarizeAddResults([ok, ng('x')], '物件')).toEqual({
      type: 'error',
      message: '1件追加、1件失敗',
    });
    expect(
      summarizeAddResults(
        [ng('duplicate key value violates unique constraint "x"')],
        '点検種別',
      ),
    ).toEqual({ type: 'error', message: '一部の点検種別は既に追加されています' });
    expect(summarizeAddResults([ng('permission denied')], '物件')).toEqual({
      type: 'error',
      message: '追加に失敗しました: permission denied',
    });
  });
});
