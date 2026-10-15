import { renderHook, act, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { DbBuildingVendor, DbProperty } from '@/types/database';
import { useRelationships } from '../hooks/useRelationships';

const mockFetchBuildingVendors = vi.fn();
const mockFetchVendorInspections = vi.fn();
const mockAddVendorInspection = vi.fn();
const mockRemoveVendorInspection = vi.fn();
const mockApiAddBuildingVendor = vi.fn();
const mockApiRemoveBuildingVendor = vi.fn();
const mockFetchMasterProperties = vi.fn();
const mockFetchMasterInspectionTypes = vi.fn();
const mockProfile = { id: 'admin-uid', role: 'admin', vendor_id: null };

// api.ts の純関数（候補の算出・結果のまとめ）は本物を使う。DB 呼び出しは下でモックに差し替える
vi.mock('@/lib/supabase', () => ({ supabase: {}, TABLES: {} }));

vi.mock('../api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../api')>();
  return {
    ...actual,
    fetchBuildingVendors: (...a: unknown[]) => mockFetchBuildingVendors(...a),
    fetchVendorInspections: (...a: unknown[]) => mockFetchVendorInspections(...a),
    addVendorInspection: (...a: unknown[]) => mockAddVendorInspection(...a),
    removeVendorInspection: (...a: unknown[]) => mockRemoveVendorInspection(...a),
  };
});

vi.mock('@/lib/api/relationships', () => ({
  addBuildingVendor: (...a: unknown[]) => mockApiAddBuildingVendor(...a),
  removeBuildingVendor: (...a: unknown[]) => mockApiRemoveBuildingVendor(...a),
}));

vi.mock('@/lib/api/masterData', () => ({
  fetchMasterProperties: (...a: unknown[]) => mockFetchMasterProperties(...a),
  fetchMasterInspectionTypes: (...a: unknown[]) => mockFetchMasterInspectionTypes(...a),
}));

vi.mock('@/stores/authStore', () => ({
  useAuthStore: (selector: (s: { profile: typeof mockProfile }) => unknown) =>
    selector({ profile: mockProfile }),
}));

// 実DBの signage_building_vendors の列に合わせた行
const bv = (id: string, property_code: string, status: DbBuildingVendor['status']): DbBuildingVendor => ({
  id,
  property_code,
  vendor_id: 'v1',
  status,
  requested_by: 'admin-uid',
  approved_by: status === 'active' ? 'admin-uid' : null,
  created_at: '2026-03-10T00:00:00Z',
  updated_at: '2026-03-10T00:00:00Z',
});

const prop = (code: string, name: string) => ({ property_code: code, property_name: name }) as DbProperty;

describe('useRelationships', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFetchBuildingVendors.mockResolvedValue([
      bv('bv1', '100', 'active'),
      bv('bv2', '200', 'pending'),
      bv('bv3', '300', 'deleted'),
    ]);
    mockFetchVendorInspections.mockResolvedValue([]);
    mockFetchMasterProperties.mockResolvedValue([
      prop('100', 'A'),
      prop('200', 'B'),
      prop('300', 'C'),
    ]);
    mockFetchMasterInspectionTypes.mockResolvedValue([]);
    mockApiAddBuildingVendor.mockResolvedValue({});
  });

  it('物件の表は active だけ、追加の候補は active / pending を除いた物件', async () => {
    const { result } = renderHook(() => useRelationships('v1'));
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.activeBuildingVendors.map((r) => r.id)).toEqual(['bv1']);
    const available = await result.current.loadAvailableProperties();
    expect(available.map((p) => p.property_code)).toEqual(['300']);
  });

  it('物件を複数まとめて追加し（共有 api で解除済みを再有効化）、結果をまとめて一覧を読み直す', async () => {
    mockApiAddBuildingVendor
      .mockResolvedValueOnce({})
      .mockRejectedValueOnce(new Error('この物件は既に追加されています'));
    const { result } = renderHook(() => useRelationships('v1'));
    await waitFor(() => expect(result.current.loading).toBe(false));
    mockFetchBuildingVendors.mockClear();

    let summary;
    await act(async () => {
      summary = await result.current.addBuildingVendors(['300', '400']);
    });

    expect(mockApiAddBuildingVendor).toHaveBeenCalledWith({
      propertyCode: '300',
      vendorId: 'v1',
      profile: mockProfile,
    });
    expect(mockApiAddBuildingVendor).toHaveBeenCalledTimes(2);
    expect(summary).toEqual({ type: 'error', message: '1件追加、1件失敗' });
    expect(mockFetchBuildingVendors).toHaveBeenCalledWith('v1');
  });

  it('点検種別の解除はソフトデリートの api を呼んで読み直す', async () => {
    mockRemoveVendorInspection.mockResolvedValue({ id: 'vi1', status: 'inactive' });
    const { result } = renderHook(() => useRelationships('v1'));
    await waitFor(() => expect(result.current.loading).toBe(false));
    mockFetchVendorInspections.mockClear();

    await act(async () => {
      await result.current.removeVendorInspection('vi1');
    });

    expect(mockRemoveVendorInspection).toHaveBeenCalledWith('vi1');
    expect(mockFetchVendorInspections).toHaveBeenCalledWith('v1');
  });

  it('物件の紐付けをまとめて解除し、失敗があっても残りは解除して、読み直しは1回だけ', async () => {
    mockApiRemoveBuildingVendor.mockResolvedValueOnce({}).mockRejectedValueOnce(new Error('rls'));
    const { result } = renderHook(() => useRelationships('v1'));
    await waitFor(() => expect(result.current.loading).toBe(false));
    mockFetchBuildingVendors.mockClear();

    let summary;
    await act(async () => {
      summary = await result.current.removeBuildingVendors(['bv1', 'bv9']);
    });

    expect(mockApiRemoveBuildingVendor.mock.calls).toEqual([['bv1'], ['bv9']]);
    expect(summary).toEqual({ removed: 1, failed: 1 });
    expect(mockFetchBuildingVendors).toHaveBeenCalledTimes(1);
  });

  it('読み込みに失敗したら v1 と同じ文言のエラーを返す', async () => {
    mockFetchBuildingVendors.mockRejectedValue(new Error('network'));
    const { result } = renderHook(() => useRelationships('v1'));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.buildingError).toEqual({ message: '紐付け情報の読み込みに失敗しました' });
  });

  it('同じ文言の失敗が続いても、失敗ごとに別のエラーを返す（通知が毎回出る）', async () => {
    mockFetchBuildingVendors.mockRejectedValue(new Error('network'));
    mockApiRemoveBuildingVendor.mockResolvedValue({});
    const { result } = renderHook(() => useRelationships('v1'));
    await waitFor(() => expect(result.current.buildingError).not.toBeNull());
    const first = result.current.buildingError;

    await act(async () => {
      await result.current.removeBuildingVendor('bv1');
    });

    expect(result.current.buildingError).toEqual(first);
    expect(result.current.buildingError).not.toBe(first);
  });

  it('表示中のサブタブだけを読み、サブタブを切り替えるたびに読み直す', async () => {
    const { result, rerender } = renderHook(({ tab }) => useRelationships('v1', tab), {
      initialProps: { tab: 'buildings' as 'buildings' | 'inspections' },
    });
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(mockFetchBuildingVendors).toHaveBeenCalledTimes(1);
    expect(mockFetchVendorInspections).not.toHaveBeenCalled();

    rerender({ tab: 'inspections' });
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(mockFetchVendorInspections).toHaveBeenCalledTimes(1);

    rerender({ tab: 'buildings' });
    await waitFor(() => expect(mockFetchBuildingVendors).toHaveBeenCalledTimes(2));
    expect(mockFetchVendorInspections).toHaveBeenCalledTimes(1);
  });

  it('保守会社が未選択なら何も読まない', () => {
    const { result } = renderHook(() => useRelationships(null));
    expect(result.current.loading).toBe(false);
    expect(mockFetchBuildingVendors).not.toHaveBeenCalled();
  });
});
