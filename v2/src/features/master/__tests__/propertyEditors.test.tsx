import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { PropertyInspectionEditor } from '../components/property/PropertyInspectionEditor';
import { UnitInspectionEditor } from '../components/property/UnitInspectionEditor';
import type { DbInspectionType, DbVendor } from '@/types/database';
import type { PropertyUnit } from '@/types/app';

vi.mock('@/lib/supabase', () => ({ supabase: {}, TABLES: {}, RPC: {} }));

const type = (id: string, name: string, category = '点検'): DbInspectionType => ({
  id,
  inspection_name: name,
  template_no: '',
  template_image: null,
  default_text: null,
  category_id: null,
  category,
  show_on_board: true,
  sort_order: 0,
  created_at: null,
});
const vendors: DbVendor[] = [
  { id: 'v1', vendor_name: 'A社', emergency_contact: null, inspection_type: null, created_at: null },
];

describe('PropertyInspectionEditor (v1 設備情報)', () => {
  it('offers only 点検 types not managed per unit, and rejects a duplicate type', () => {
    const onChange = vi.fn();
    const onError = vi.fn();
    render(
      <PropertyInspectionEditor
        value={[{ inspection_type_id: 'fire', vendor_id: null, inspection_months: [], remarks: '', remarks2: '' }]}
        onChange={onChange}
        inspectionTypes={[type('fire', '消防設備点検'), type('elev', 'エレベーター点検'), type('clean', '清掃', '清掃')]}
        excludedTypeIds={new Set(['elev'])}
        vendors={vendors}
        onError={onError}
      />,
    );
    const select = screen.getByLabelText('設備種類') as HTMLSelectElement;
    expect(Array.from(select.options).map((o) => o.value)).toEqual(['', 'fire']);

    fireEvent.change(select, { target: { value: 'fire' } });
    fireEvent.click(screen.getByRole('button', { name: '追加' }));
    expect(onError).toHaveBeenCalledWith('この設備種類は既に登録されています');
    expect(onChange).not.toHaveBeenCalled();
  });
});

// v1 startEditPropertyEquipment: select に無い種別は空になり、更新は「設備種類を選択してください」で止まる
describe('PropertyInspectionEditor edit of a row whose type is not an option', () => {
  it('clears the type and refuses 更新, like v1', () => {
    const onChange = vi.fn();
    const onError = vi.fn();
    render(
      <PropertyInspectionEditor
        value={[{ inspection_type_id: 'build', vendor_id: null, inspection_months: [], remarks: '', remarks2: '' }]}
        onChange={onChange}
        inspectionTypes={[type('fire', '消防設備点検'), type('build', '大規模修繕', '工事')]}
        excludedTypeIds={new Set()}
        vendors={vendors}
        onError={onError}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: '編集' }));
    expect((screen.getByLabelText('設備種類') as HTMLSelectElement).value).toBe('');

    fireEvent.click(screen.getByRole('button', { name: '更新' }));
    expect(onError).toHaveBeenCalledWith('設備種類を選択してください');
    expect(onChange).not.toHaveBeenCalled();
  });
});

// 物件の保存は表の行だけを送るので、「追加」を押していない入力があることを呼ぶ側へ知らせる
describe('PropertyInspectionEditor pending input', () => {
  it('reports a draft until it is added or cleared with 取消', () => {
    const onDraftChange = vi.fn();
    render(
      <PropertyInspectionEditor
        value={[]}
        onChange={vi.fn()}
        inspectionTypes={[type('fire', '消防設備点検')]}
        excludedTypeIds={new Set()}
        vendors={vendors}
        onError={vi.fn()}
        onDraftChange={onDraftChange}
      />,
    );
    expect(onDraftChange).toHaveBeenLastCalledWith(false);
    fireEvent.change(screen.getByLabelText('備考'), { target: { value: '2基' } });
    expect(onDraftChange).toHaveBeenLastCalledWith(true);
    fireEvent.click(screen.getByRole('button', { name: '取消' }));
    expect(onDraftChange).toHaveBeenLastCalledWith(false);
  });
});

describe('UnitInspectionEditor (v1 台ごとの保守)', () => {
  const units: PropertyUnit[] = [
    {
      unit_id: 'u1',
      category_code: 'elevator',
      category_label: 'エレベーター',
      unit_code: 'E-1',
      unit_location: '',
      unit_remarks: '',
      unit_remarks2: '',
      inspections: [
        {
          inspection_id: 'ui1',
          inspection_type_id: 'elev',
          inspection_type_label: 'エレベーター点検',
          vendor_id: 'gone',
          vendor_name: '旧B社',
          inspection_months: [4],
          inspected_on: '2026-04-01',
          legacy_remarks: '',
          legacy_remarks2: '',
        },
        {
          inspection_type_id: '',
          inspection_type_label: '',
          vendor_id: null,
          vendor_name: '',
          inspection_months: [],
          inspected_on: null,
          legacy_remarks: '',
          legacy_remarks2: '',
        },
      ],
    },
  ];

  it('keeps an unlisted vendor selectable and rejects the same type twice on one unit', () => {
    const onChange = vi.fn();
    const onError = vi.fn();
    render(
      <UnitInspectionEditor
        units={units}
        onChange={onChange}
        typeOptions={[
          { category_code: 'elevator', inspection_type_id: 'elev', inspection_type_label: 'エレベーター点検', sort: 1 },
          { category_code: 'parking', inspection_type_id: 'park', inspection_type_label: '駐車場点検', sort: 2 },
        ]}
        vendors={vendors}
        onError={onError}
      />,
    );
    const vendorSelects = screen.getAllByLabelText('保守会社') as HTMLSelectElement[];
    expect(vendorSelects[0]?.value).toBe('gone');
    expect(screen.getByRole('option', { name: '旧B社' })).toBeInTheDocument();

    // 新しい行の選択肢は台の大分類の種別だけ
    const typeSelect = screen.getByLabelText('点検種別') as HTMLSelectElement;
    expect(Array.from(typeSelect.options).map((o) => o.value)).toEqual(['', 'elev']);
    fireEvent.change(typeSelect, { target: { value: 'elev' } });
    expect(onError).toHaveBeenCalledWith('この台には同じ点検種別が既に登録されています');
    expect(onChange).not.toHaveBeenCalled();
  });
});
