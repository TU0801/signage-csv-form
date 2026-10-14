import { describe, it, expect, vi, beforeEach } from 'vitest';
import { normalizeTerminalId, toTerminal } from '@/lib/terminal';
import { diffUnitInspections, unitManagedTypeIds } from '../inspections';
import { rpcAllRows, overlayInspections } from '../masterData';
import { getAssignedBuildings } from '../relationships';
import type { MasterProperty, PropertyUnit } from '@/types/app';

const mockRpc = vi.fn();
const mockFrom = vi.fn();

vi.mock('@/lib/supabase', () => ({
  supabase: {
    rpc: (...args: unknown[]) => mockRpc(...args),
    from: (...args: unknown[]) => mockFrom(...args),
  },
  TABLES: {
    properties: 'signage_master_properties',
    buildingVendors: 'signage_building_vendors',
  },
  RPC: {
    inspectionsAll: 'inspections_all',
  },
}));

describe('terminal normalization (v1 shared-utils.js normalizeTerminalId)', () => {
  it('reads terminalId / terminal_id / JSON string forms', () => {
    expect(normalizeTerminalId('T1')).toBe('T1');
    expect(normalizeTerminalId('{"terminalId":"T2"}')).toBe('T2');
    expect(normalizeTerminalId({ terminal_id: 'T3' })).toBe('T3');
    expect(normalizeTerminalId(null)).toBe('');
    expect(toTerminal({ terminalId: 'T4' })).toEqual({ terminal_id: 'T4', supplement: '' });
  });
});

describe('diffUnitInspections (v1 relationships.js)', () => {
  const unit = (inspections: PropertyUnit['inspections']) => [{ unit_id: 'u1', inspections }];
  const row = (over: Partial<PropertyUnit['inspections'][number]> = {}) => ({
    inspection_id: 'i1',
    inspection_type_id: 't1',
    inspection_type_label: '',
    vendor_id: 'v1',
    vendor_name: '',
    inspection_months: [3, 1],
    inspected_on: '2026-04-01',
    legacy_remarks: '',
    legacy_remarks2: '',
    ...over,
  });

  it('sends only changed rows, with months sorted and inspected_on as the first of the month', () => {
    const original = unit([row()]);
    expect(diffUnitInspections(original, unit([row({ inspection_months: [1, 3, 3] })]))).toEqual({
      upserts: [],
      deletes: [],
    });
    expect(diffUnitInspections(original, unit([row({ inspected_on: '2026-05' })]))).toEqual({
      upserts: [
        {
          unit_id: 'u1',
          inspection_type_id: 't1',
          vendor_id: 'v1',
          inspection_months: [1, 3],
          inspected_on: '2026-05-01',
        },
      ],
      deletes: [],
    });
    expect(diffUnitInspections(original, unit([]))).toEqual({
      upserts: [],
      deletes: [{ inspection_id: 'i1' }],
    });
  });

  it('unitManagedTypeIds collects types of unit categories and types already on units', () => {
    const ids = unitManagedTypeIds(
      [{ ...unit([row({ inspection_type_id: 'old' })])[0]!, category_code: 'EV' } as PropertyUnit],
      [
        { category_code: 'EV', inspection_type_id: 't-ev', inspection_type_label: '', sort: 1 },
        { category_code: 'FIRE', inspection_type_id: 't-fire', inspection_type_label: '', sort: 2 },
      ],
    );
    expect([...ids].sort()).toEqual(['old', 't-ev']);
  });
});

describe('rpcAllRows (v1 master-data.js)', () => {
  beforeEach(() => vi.clearAllMocks());

  it('pages in units of 1000 until count is reached', async () => {
    const page1 = Array.from({ length: 1000 }, (_, i) => ({ n: i }));
    const page2 = [{ n: 1000 }, { n: 1001 }];
    const range = vi
      .fn()
      .mockResolvedValueOnce({ data: page1, error: null, count: 1002 })
      .mockResolvedValueOnce({ data: page2, error: null, count: 1002 });
    mockRpc.mockReturnValue({ range });

    const rows = await rpcAllRows('unit_inspections_all');

    expect(rows).toHaveLength(1002);
    expect(mockRpc).toHaveBeenCalledWith('unit_inspections_all', {}, { count: 'exact' });
    expect(range).toHaveBeenNthCalledWith(1, 0, 999);
    expect(range).toHaveBeenNthCalledWith(2, 1000, 1999);
  });
});

describe('overlayInspections (v1 master-data.js)', () => {
  const props: MasterProperty[] = [
    { id: '1', property_code: 'A', property_name: 'a', terminals: [], inspections: [] },
    {
      id: '2',
      property_code: 'B',
      property_name: 'b',
      terminals: [],
      inspections: [
        { inspection_type_id: 'legacy', vendor_id: null, inspection_months: [], remarks: '', remarks2: '' },
      ],
    },
  ];

  beforeEach(() => vi.clearAllMocks());

  it('replaces inspections with the biz rows (properties not returned get none)', async () => {
    mockRpc.mockResolvedValue({
      data: [
        {
          property_code: 'A',
          inspection_type_id: 't1',
          vendor_id: 'v1',
          inspection_months: [4],
          remarks: null,
          remarks2: null,
        },
      ],
      error: null,
    });
    const result = await overlayInspections(props);
    expect(result[0]!.inspections).toEqual([
      { inspection_type_id: 't1', vendor_id: 'v1', inspection_months: [4], remarks: '', remarks2: '' },
    ]);
    expect(result[1]!.inspections).toEqual([]);
  });

  it('keeps the legacy jsonb only when the RPC fails', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    mockRpc.mockResolvedValue({ data: null, error: { message: 'boom' } });
    const result = await overlayInspections(props);
    expect(result).toBe(props);
  });
});

describe('getAssignedBuildings (v1 relationships.js)', () => {
  beforeEach(() => vi.clearAllMocks());

  it('limits a general user to properties linked active to their vendor', async () => {
    const eqStatus = vi.fn().mockResolvedValue({ data: [{ property_code: 'A' }], error: null });
    const inCodes = vi.fn().mockResolvedValue({ data: [{ property_code: 'A' }], error: null });
    mockFrom.mockImplementation((table: string) =>
      table === 'signage_building_vendors'
        ? { select: () => ({ eq: () => ({ eq: eqStatus }) }) }
        : { select: () => ({ in: inCodes }) },
    );

    const result = await getAssignedBuildings({ role: 'user', vendor_id: 'v1' });

    expect(eqStatus).toHaveBeenCalledWith('status', 'active');
    expect(inCodes).toHaveBeenCalledWith('property_code', ['A']);
    expect(result).toEqual([{ property_code: 'A' }]);
  });

  it('returns nothing for a general user without a vendor', async () => {
    expect(await getAssignedBuildings({ role: 'user', vendor_id: null })).toEqual([]);
    expect(mockFrom).not.toHaveBeenCalled();
  });
});
