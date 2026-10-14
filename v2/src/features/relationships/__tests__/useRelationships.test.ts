import { renderHook, act, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { useRelationships } from '../hooks/useRelationships';

// Mock supabase
const mockSelect = vi.fn();
const mockInsert = vi.fn();
const mockDelete = vi.fn();
const mockUpdate = vi.fn();
const mockEq = vi.fn();
const mockOrder = vi.fn();
const mockNeq = vi.fn();
const mockApiAddBuildingVendor = vi.fn();
const mockApiRemoveBuildingVendor = vi.fn();
const mockProfile = { id: 'u1', role: 'admin', vendor_id: null };

vi.mock('@/lib/supabase', () => ({
  supabase: {
    from: vi.fn(() => ({
      select: mockSelect,
      insert: mockInsert,
      delete: mockDelete,
      update: mockUpdate,
    })),
  },
  TABLES: {
    buildingVendors: 'signage_building_vendors',
    vendorInspections: 'signage_vendor_inspections',
  },
}));

vi.mock('@/lib/api/relationships', () => ({
  addBuildingVendor: (...args: unknown[]) => mockApiAddBuildingVendor(...args),
  removeBuildingVendor: (...args: unknown[]) => mockApiRemoveBuildingVendor(...args),
}));

vi.mock('@/stores/authStore', () => ({
  useAuthStore: (selector: (s: { profile: typeof mockProfile }) => unknown) =>
    selector({ profile: mockProfile }),
}));

describe('useRelationships', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    // Default chain setup: select -> eq -> order -> resolves
    mockSelect.mockReturnValue({ eq: mockEq });
    mockEq.mockReturnValue({ order: mockOrder });
    mockOrder.mockResolvedValue({ data: [], error: null });

    // Insert chain
    mockInsert.mockResolvedValue({ error: null });

    // Delete chain
    mockDelete.mockReturnValue({ eq: mockEq });

    // Update chain
    mockUpdate.mockReturnValue({ eq: mockEq });

    // Default eq resolve
    mockEq.mockImplementation(() => ({
      order: mockOrder,
      eq: mockEq,
      neq: mockNeq,
    }));
    mockNeq.mockReturnValue({ order: mockOrder });
    mockOrder.mockResolvedValue({ data: [], error: null });
    mockApiAddBuildingVendor.mockResolvedValue({});
    mockApiRemoveBuildingVendor.mockResolvedValue({});
  });

  it('returns empty arrays when vendorId is null', async () => {
    const { result } = renderHook(() => useRelationships(null));

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.buildingVendors).toEqual([]);
    expect(result.current.vendorInspections).toEqual([]);
  });

  it('fetches data when vendorId is provided', async () => {
    const mockBuildingVendors = [
      { id: '1', property_code: 'P001', vendor_id: 'v1', status: 'active' },
    ];
    const mockVendorInspections = [
      { id: '2', vendor_id: 'v1', inspection_id: 'i1', status: 'active' },
    ];

    let callCount = 0;
    mockOrder.mockImplementation(() => {
      callCount++;
      if (callCount % 2 === 1) {
        return Promise.resolve({ data: mockBuildingVendors, error: null });
      }
      return Promise.resolve({ data: mockVendorInspections, error: null });
    });

    const { result } = renderHook(() => useRelationships('v1'));

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.buildingVendors).toEqual(mockBuildingVendors);
    expect(result.current.vendorInspections).toEqual(mockVendorInspections);
  });

  it('sets error on fetch failure', async () => {
    mockOrder.mockResolvedValue({ data: null, error: { message: 'Network error' } });

    const { result } = renderHook(() => useRelationships('v1'));

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.error).toBeTruthy();
  });

  it('addBuildingVendor goes through lib/api (re-activates soft-deleted rows) and excludes deleted on fetch', async () => {
    mockOrder.mockResolvedValue({ data: [], error: null });

    const { result } = renderHook(() => useRelationships('v1'));

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    await act(async () => {
      await result.current.addBuildingVendor('P001');
    });

    expect(mockApiAddBuildingVendor).toHaveBeenCalledWith({
      propertyCode: 'P001',
      vendorId: 'v1',
      profile: mockProfile,
    });
    expect(mockInsert).not.toHaveBeenCalled();
    expect(mockNeq).toHaveBeenCalledWith('status', 'deleted');
  });

  it('removeBuildingVendor soft-deletes via lib/api instead of a physical delete', async () => {
    const { result } = renderHook(() => useRelationships('v1'));

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    await act(async () => {
      await result.current.removeBuildingVendor('bv1');
    });

    expect(mockApiRemoveBuildingVendor).toHaveBeenCalledWith('bv1');
    expect(mockDelete).not.toHaveBeenCalled();
  });

  it('addVendorInspection calls insert and refetches', async () => {
    mockOrder.mockResolvedValue({ data: [], error: null });

    const { result } = renderHook(() => useRelationships('v1'));

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    await act(async () => {
      await result.current.addVendorInspection('i1');
    });

    expect(mockInsert).toHaveBeenCalledWith({
      vendor_id: 'v1',
      inspection_id: 'i1',
      status: 'active',
    });
  });

  it('toggleVendorInspectionStatus calls update', async () => {
    mockOrder.mockResolvedValue({ data: [], error: null });
    mockEq.mockImplementation(() => ({
      order: mockOrder,
      eq: mockEq,
    }));

    const { result } = renderHook(() => useRelationships('v1'));

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    await act(async () => {
      await result.current.toggleVendorInspectionStatus('id1', 'active');
    });

    expect(mockUpdate).toHaveBeenCalledWith({ status: 'inactive' });
  });
});
