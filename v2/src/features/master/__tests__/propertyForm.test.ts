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
  managementCompanyMap,
  newUnitInspection,
} = await import('../lib/propertyForm');
const { diffUnitInspections } = await import('@/lib/api/inspections');

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
    // 検査月（YYYY-MM-01）。読めていない（undefined）と未登録（null）は同じ扱い
    expect(inspectionsChanged([row], [{ ...row, inspected_on: '2026-04-01' }])).toBe(true);
    expect(inspectionsChanged([{ ...row, inspected_on: null }], [row])).toBe(false);
    expect(inspectionsChanged([row], [])).toBe(true);
  });

  // 一覧の補足列（1025 E2）：設備は点検行1行ずつ＋台ごとに管理している種別は台の保守の行で展開。同じ保守会社も重ねない
  it('propertyListSummary lists one row per equipment (units expanded, aggregate row skipped)', () => {
    const row = (vendor_id: string | null, inspection_type_id = 't') => ({
      inspection_type_id,
      vendor_id,
      inspection_months: [],
      remarks: '',
      remarks2: '',
    });
    const sum = propertyListSummary({
      // elev は台で管理している種別なので、物件単位の集計行は数えない
      inspections: [row('v1'), row(null), row('v1', 'elev')],
      units: [
        { ...unit([insp({ vendor_id: 'v1' })]), unit_id: 'u1', unit_code: 'No1' },
        { ...unit([insp({ vendor_id: 'v1' })]), unit_id: 'u2', unit_code: '' },
        { ...unit([]), unit_id: 'u3', unit_code: 'No3' },
      ],
    });
    expect(sum.equipmentCount).toBe(4);
    expect(sum.unitCount).toBe(3);
    expect(sum.equipment.map((e) => [e.vendorId, e.unitLabel])).toEqual([
      ['v1', null],
      [null, null],
      ['v1', 'No1'],
      // 台コードが無い台は同じ大分類の並びで No を振る
      ['v1', 'No2'],
    ]);
    expect(sum.equipment[2]?.inspectionTypeLabel).toBe('エレベーター点検');
  });

  // 1025 E1: 管理会社の列は略称、略称が無ければ正式名。管理会社が未設定の物件は入れない（「管理会社なし」になる）
  it('managementCompanyMap prefers the short name and skips properties without a company', () => {
    const m = managementCompanyMap([
      { property_code: 'A', management_company_id: 'm1', management_company_name: '株式会社えん建物管理', management_company_short_name: '㈱えん建物管理' },
      { property_code: 'B', management_company_id: 'm2', management_company_name: '株式会社長谷工コミュニティ九州', management_company_short_name: null },
      { property_code: 'C', management_company_id: null, management_company_name: null, management_company_short_name: null },
    ]);
    expect(m.get('A')).toEqual({ id: 'm1', label: '㈱えん建物管理', name: '株式会社えん建物管理' });
    expect(m.get('B')?.label).toBe('株式会社長谷工コミュニティ九州');
    expect(m.has('C')).toBe(false);
  });

  it('validateUnitInspections rejects unselected and duplicated types', () => {
    expect(validateUnitInspections([unit([insp()])])).toBeNull();
    expect(validateUnitInspections([unit([insp(), insp({ inspection_id: undefined, inspection_type_id: '' })])])).toBe(
      '台ごとの保守に、点検種別を選んでいない行があります（点検種別を選ぶか、入れた保守会社・点検月・検査月を消してください）',
    );
    // 何も入っていない未保存の行と「（外す）」を選んだ行は数えない
    expect(
      validateUnitInspections([
        unit([insp({ remove: true }), insp({ inspection_id: undefined, inspection_type_id: '', vendor_id: null, inspection_months: [], inspected_on: null })]),
      ]),
    ).toBeNull();
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

  // 2026-10-27 修正依頼1026⑥: 『外す』『＋ 点検種別』ボタンを無くしても、外す・足すは前と同じ RPC に同じ引数で届く
  it('sends a row marked （外す） as the same delete the 『外す』 button made, and a row picked on an empty unit as an upsert', async () => {
    const empty = { ...unit([]), unit_id: 'u2' };
    const picked = { ...newUnitInspection(), inspection_type_id: 'remote', vendor_id: 'v9' };
    await savePropertyForm({
      ...base,
      originalUnits: [unit([insp()]), empty],
      units: [unit([insp({ remove: true, vendor_id: 'v3' })]), { ...empty, inspections: [picked] }],
    });
    // 前の『外す』（行を消す）と『＋ 点検種別』（newUnitInspection の行を足して種別を選ぶ）の差分
    const before = diffUnitInspections([unit([insp()]), empty], [unit([]), { ...empty, inspections: [picked] }]);
    expect(before).toEqual({
      upserts: [{ unit_id: 'u2', inspection_type_id: 'remote', vendor_id: 'v9', inspection_months: [], inspected_on: null }],
      deletes: [{ inspection_id: 'ui1' }],
    });
    expect(saveUnitInspectionsToBiz).toHaveBeenCalledWith(before, undefined);
    // 外す行の保守会社は紐付け管理に足さない
    const [, rows] = syncBuildingVendorsFromEquipment.mock.calls[0] as [string, { vendor_id: string }[]];
    expect(rows.map((r) => r.vendor_id)).toEqual(['v2', 'v9']);
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
