import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { PropertyUnit, UnitInspection } from '@/types/app';

const saveInspectionsToBiz = vi.fn();
const saveUnitInspectionsToBiz = vi.fn();
const syncBuildingVendorsFromEquipment = vi.fn();

vi.mock('@/lib/supabase', () => ({ supabase: {}, TABLES: {}, RPC: {} }));
vi.mock('@/lib/api/inspections', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/api/inspections')>()),
  saveInspectionsToBiz: (...a: unknown[]) => saveInspectionsToBiz(...a),
  saveUnitInspectionsToBiz: (...a: unknown[]) => saveUnitInspectionsToBiz(...a),
}));
vi.mock('@/lib/api/relationships', () => ({
  syncBuildingVendorsFromEquipment: (...a: unknown[]) => syncBuildingVendorsFromEquipment(...a),
}));

const {
  terminalSummary,
  validateUnitInspections,
  savePropertyForm,
  inspectionsChanged,
  propertyListSummary,
  vendorSummary,
} = await import('../lib/propertyForm');

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
  it('terminalSummary shows up to 4 ids and the count', () => {
    const t = (id: string) => ({ terminal_id: id, supplement: '' });
    expect(terminalSummary([])).toBe('なし (0台)');
    expect(terminalSummary(['a', 'b', 'c', 'd', 'e'].map(t))).toBe('a, b, c, d... (5台)');
  });

  // 閉じる前の破棄確認：点検月の並びや空の値の違いでは「変更あり」にしない
  it('inspectionsChanged ignores month order and empty-value differences', () => {
    const row = { inspection_type_id: 'fire', vendor_id: null, inspection_months: [4, 10], remarks: '', remarks2: '' };
    expect(inspectionsChanged([row], [{ ...row, vendor_id: '' as unknown as null, inspection_months: [10, 4] }])).toBe(false);
    expect(inspectionsChanged([row], [{ ...row, remarks: '2基' }])).toBe(true);
    expect(inspectionsChanged([row], [])).toBe(true);
  });

  // 一覧の補足列：設備の数・台の数・保守会社（設備情報と台の保守から重複なく）
  it('propertyListSummary and vendorSummary', () => {
    const row = (vendor_id: string | null) => ({
      inspection_type_id: 't',
      vendor_id,
      inspection_months: [],
      remarks: '',
      remarks2: '',
    });
    expect(
      propertyListSummary({ inspections: [row('v1'), row(null), row('v2')], units: [unit([insp({ vendor_id: 'v1' }), insp({ vendor_id: 'v3' })])] }),
    ).toEqual({ equipmentCount: 3, unitCount: 1, vendorIds: ['v1', 'v2', 'v3'] });
    // 台ごとに管理している種別（elev）の集計行は、モーダルの設備情報の表に出ないので数えない
    expect(
      propertyListSummary({ inspections: [{ ...row('v1'), inspection_type_id: 'elev' }], units: [unit([insp()])] }).equipmentCount,
    ).toBe(0);
    expect(vendorSummary([])).toBe('-');
    expect(vendorSummary(['A社', 'B社'])).toBe('A社、B社');
    expect(vendorSummary(['A社', 'B社', 'C社', 'D社'])).toBe('A社、B社 他2社');
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
    propertyCode: 'z0023A01',
    inspections,
    managedTypeIds: managed,
    originalUnits: [unit([insp()])],
    units: [unit([insp({ vendor_id: 'v3' })])],
    profile: { id: 'admin-1' },
  };

  beforeEach(() => {
    vi.clearAllMocks();
    saveInspectionsToBiz.mockResolvedValue({ saved: 1 });
    saveUnitInspectionsToBiz.mockResolvedValue({ saved: 1, errors: [] });
    syncBuildingVendorsFromEquipment.mockResolvedValue({ added: 2 });
  });

  // 物件そのもの（コード・名前・端末）は保存しない（2026-10-15。正本は業務システム）。送るのは RPC だけ
  it('saves biz inspections with skip ids, the unit diff, and vendor links (not the property row)', async () => {
    await expect(savePropertyForm(base)).resolves.toEqual({ added: 2, errors: [] });
    // 4つ目は権限（管理会社は mgmt_* の RPC で送る）。base の profile は role を持たない
    expect(saveInspectionsToBiz).toHaveBeenCalledWith('z0023A01', inspections, managed, undefined);
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
    }, undefined);
    // 設備情報と台ごとの保守の両方の保守会社を紐付けに足す
    const [, rows, profile] = syncBuildingVendorsFromEquipment.mock.calls[0] as [string, { vendor_id: string }[], unknown];
    expect(rows.map((r) => r.vendor_id)).toEqual(['v2', 'v3']);
    expect(profile).toEqual({ id: 'admin-1' });
  });

  it('keeps going after biz failures and returns their messages', async () => {
    saveInspectionsToBiz.mockRejectedValue({ message: 'この点検は台ごとに管理しています' });
    saveUnitInspectionsToBiz.mockResolvedValue({ saved: 0, errors: ['E1', 'E1'] });
    syncBuildingVendorsFromEquipment.mockRejectedValue(new Error('x'));
    await expect(savePropertyForm(base)).resolves.toEqual({
      added: 0,
      errors: [
        '点検情報の保存に失敗しました: この点検は台ごとに管理しています',
        '台ごとの保守 2 件の保存に失敗しました: E1',
        '紐付け管理への反映に失敗しました',
      ],
    });
  });
});
