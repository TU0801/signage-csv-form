import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { PropertyUnit, UnitInspection } from '@/types/app';

const addProperty = vi.fn();
const updateProperty = vi.fn();
const saveInspectionsToBiz = vi.fn();
const saveUnitInspectionsToBiz = vi.fn();
const syncBuildingVendorsFromEquipment = vi.fn();

vi.mock('@/lib/supabase', () => ({ supabase: {}, TABLES: {}, RPC: {} }));
vi.mock('@/lib/api/admin-masters', () => ({
  addProperty: (...a: unknown[]) => addProperty(...a),
  updateProperty: (...a: unknown[]) => updateProperty(...a),
}));
vi.mock('@/lib/api/inspections', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/api/inspections')>()),
  saveInspectionsToBiz: (...a: unknown[]) => saveInspectionsToBiz(...a),
  saveUnitInspectionsToBiz: (...a: unknown[]) => saveUnitInspectionsToBiz(...a),
}));
vi.mock('@/lib/api/relationships', () => ({
  syncBuildingVendorsFromEquipment: (...a: unknown[]) => syncBuildingVendorsFromEquipment(...a),
}));

const { collectTerminals, terminalSummary, validateUnitInspections, savePropertyForm } = await import(
  '../lib/propertyForm'
);

const insp = (over: Partial<UnitInspection> = {}): UnitInspection => ({
  inspection_id: 'ui1',
  inspection_type_id: 'elev',
  inspection_type_label: 'エレベーター点検',
  vendor_id: 'v1',
  vendor_name: 'A社',
  inspection_months: [4],
  inspected_on: '2026-04-01',
  legacy_remarks: '',
  legacy_remarks2: '',
  ...over,
});

const unit = (inspections: UnitInspection[]): PropertyUnit => ({
  unit_id: 'u1',
  category_code: 'elevator',
  category_label: 'エレベーター',
  unit_code: 'E-1',
  unit_location: '',
  unit_remarks: '',
  unit_remarks2: '',
  inspections,
});

describe('property form helpers (v1 js/admin-masters.js)', () => {
  // v1 handleMasterFormSubmit: trim して端末IDが空の行は保存しない。キーは terminal_id
  it('collectTerminals trims and drops rows without a terminal id', () => {
    expect(
      collectTerminals([
        { terminal_id: ' T1 ', supplement: ' 1F ' },
        { terminal_id: '  ', supplement: '補足だけ' },
      ]),
    ).toEqual([{ terminal_id: 'T1', supplement: '1F' }]);
  });

  it('terminalSummary shows up to 4 ids and the count', () => {
    const t = (id: string) => ({ terminal_id: id, supplement: '' });
    expect(terminalSummary([])).toBe('なし (0台)');
    expect(terminalSummary(['a', 'b', 'c', 'd', 'e'].map(t))).toBe('a, b, c, d... (5台)');
  });

  it('validateUnitInspections rejects unselected and duplicated types', () => {
    expect(validateUnitInspections([unit([insp()])])).toBeNull();
    expect(validateUnitInspections([unit([insp(), insp({ inspection_id: undefined, inspection_type_id: '' })])])).toBe(
      '台ごとの保守に、点検種別を選んでいない行があります（選ぶか、行を外してください）',
    );
    expect(validateUnitInspections([unit([insp(), insp({ inspection_id: undefined })])])).toBe(
      '台ごとの保守で、同じ台に同じ点検種別が2行あります',
    );
  });
});

describe('savePropertyForm (v1 handleMasterFormSubmit)', () => {
  const managed = new Set(['elev']);
  const inspections = [
    { inspection_type_id: 'fire', vendor_id: 'v2', inspection_months: [3], remarks: '', remarks2: '' },
  ];
  const base = {
    id: 'p1',
    propertyCode: 'z0023A01',
    propertyName: '物件A',
    terminals: [{ terminal_id: 'T1', supplement: '' }],
    inspections,
    managedTypeIds: managed,
    originalUnits: [unit([insp()])],
    units: [unit([insp({ vendor_id: 'v3' })])],
    profile: { id: 'admin-1' },
  };

  beforeEach(() => {
    vi.clearAllMocks();
    updateProperty.mockResolvedValue({});
    addProperty.mockResolvedValue({});
    saveInspectionsToBiz.mockResolvedValue({ saved: 1 });
    saveUnitInspectionsToBiz.mockResolvedValue({ saved: 1, errors: [] });
    syncBuildingVendorsFromEquipment.mockResolvedValue({ added: 2 });
  });

  it('saves the property (3 columns), then biz inspections with skip ids, the unit diff, and vendor links', async () => {
    await expect(savePropertyForm(base)).resolves.toEqual({ added: 2, errors: [] });
    expect(updateProperty).toHaveBeenCalledWith('p1', {
      property_code: 'z0023A01',
      property_name: '物件A',
      terminals: [{ terminal_id: 'T1', supplement: '' }],
    });
    expect(addProperty).not.toHaveBeenCalled();
    expect(saveInspectionsToBiz).toHaveBeenCalledWith('z0023A01', inspections, managed);
    // 差分だけ（保守会社を変えた1行）
    expect(saveUnitInspectionsToBiz).toHaveBeenCalledWith({
      upserts: [
        {
          unit_id: 'u1',
          inspection_type_id: 'elev',
          vendor_id: 'v3',
          inspection_months: [4],
          inspected_on: '2026-04-01',
        },
      ],
      deletes: [],
    });
    // 設備情報と台ごとの保守の両方の保守会社を紐付けに足す
    const [, rows, profile] = syncBuildingVendorsFromEquipment.mock.calls[0] as [string, { vendor_id: string }[], unknown];
    expect(rows.map((r) => r.vendor_id)).toEqual(['v2', 'v3']);
    expect(profile).toEqual({ id: 'admin-1' });
  });

  it('keeps going after biz failures and returns their messages (property stays saved)', async () => {
    saveInspectionsToBiz.mockRejectedValue({ message: 'この点検は台ごとに管理しています' });
    saveUnitInspectionsToBiz.mockResolvedValue({ saved: 0, errors: ['E1', 'E1'] });
    syncBuildingVendorsFromEquipment.mockRejectedValue(new Error('x'));
    await expect(savePropertyForm(base)).resolves.toEqual({
      added: 0,
      errors: [
        '点検情報の保存に失敗しました: この点検は台ごとに管理しています',
        '台ごとの保守 2 件の保存に失敗しました: E1',
        '紐付け管理への反映に失敗しました（物件は保存済みです）',
      ],
    });
  });

  it('does not touch biz when the property save itself fails', async () => {
    addProperty.mockRejectedValue(new Error('duplicate key'));
    await expect(savePropertyForm({ ...base, id: null })).rejects.toThrow('duplicate key');
    expect(saveInspectionsToBiz).not.toHaveBeenCalled();
    expect(saveUnitInspectionsToBiz).not.toHaveBeenCalled();
    expect(syncBuildingVendorsFromEquipment).not.toHaveBeenCalled();
  });
});
