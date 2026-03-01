import { describe, it, expect, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useCascadingSelects } from '../hooks/useCascadingSelects';
import type { UseFormSetValue } from 'react-hook-form';
import type { EntryFormData } from '@/types/app';
import type { DbProperty, DbVendor, DbInspectionType, DbCategory } from '@/types/database';

const mockProperties: DbProperty[] = [
  {
    id: '1',
    property_code: 'P001',
    property_name: 'テストマンション',
    terminals: [
      { id: 'T001', supplement: '1F' },
      { id: 'T002', supplement: '2F' },
    ],
    created_at: null,
  },
  {
    id: '2',
    property_code: 'P002',
    property_name: 'サンプルビル',
    terminals: [{ id: 'T003' }],
    created_at: null,
  },
];

const mockVendors: DbVendor[] = [
  {
    id: '1',
    vendor_name: '保守会社A',
    emergency_contact: '03-1111-2222',
    inspection_type: null,
    created_at: null,
  },
  {
    id: '2',
    vendor_name: '保守会社B',
    emergency_contact: '03-3333-4444',
    inspection_type: null,
    created_at: null,
  },
];

const mockInspectionTypes: DbInspectionType[] = [
  {
    id: '1',
    inspection_name: '消防設備点検',
    template_no: 'TPL001',
    template_image: 'https://example.com/img1.png',
    default_text: '消防設備の点検を行います',
    category_id: 'cat1',
    category: '消防',
    show_on_board: true,
    sort_order: 1,
    created_at: null,
  },
  {
    id: '2',
    inspection_name: 'エレベーター点検',
    template_no: 'TPL002',
    template_image: null,
    default_text: 'エレベーター点検のお知らせ',
    category_id: 'cat2',
    category: '設備',
    show_on_board: false,
    sort_order: 2,
    created_at: null,
  },
  {
    id: '3',
    inspection_name: '消火器点検',
    template_no: 'TPL003',
    template_image: null,
    default_text: '消火器点検のお知らせ',
    category_id: 'cat1',
    category: '消防',
    show_on_board: true,
    sort_order: 3,
    created_at: null,
  },
];

const mockCategories: DbCategory[] = [
  { id: 'cat1', category_name: '消防', sort_order: 1, created_at: null },
  { id: 'cat2', category_name: '設備', sort_order: 2, created_at: null },
];

function createMockSetValue() {
  return vi.fn() as unknown as UseFormSetValue<EntryFormData>;
}

describe('useCascadingSelects', () => {
  it('should set terminalId when property changes', () => {
    const setValue = createMockSetValue();
    const { result } = renderHook(() =>
      useCascadingSelects({
        setValue,
        properties: mockProperties,
        vendors: mockVendors,
        inspectionTypes: mockInspectionTypes,
        categories: mockCategories,
      }),
    );

    act(() => {
      result.current.handlePropertyChange('P001');
    });

    expect(setValue).toHaveBeenCalledWith('propertyCode', 'P001');
    expect(setValue).toHaveBeenCalledWith('terminalId', 'T001');
  });

  it('should clear terminalId for property with no terminals', () => {
    const noTerminalProperties: DbProperty[] = [
      { id: '3', property_code: 'P003', property_name: '端末なし物件', terminals: [], created_at: null },
    ];
    const setValue = createMockSetValue();
    const { result } = renderHook(() =>
      useCascadingSelects({
        setValue,
        properties: noTerminalProperties,
        vendors: mockVendors,
        inspectionTypes: mockInspectionTypes,
        categories: mockCategories,
      }),
    );

    act(() => {
      result.current.handlePropertyChange('P003');
    });

    expect(setValue).toHaveBeenCalledWith('propertyCode', 'P003');
    expect(setValue).toHaveBeenCalledWith('terminalId', '');
  });

  it('should set emergencyContact when vendor changes', () => {
    const setValue = createMockSetValue();
    const { result } = renderHook(() =>
      useCascadingSelects({
        setValue,
        properties: mockProperties,
        vendors: mockVendors,
        inspectionTypes: mockInspectionTypes,
        categories: mockCategories,
      }),
    );

    act(() => {
      result.current.handleVendorChange('保守会社A');
    });

    expect(setValue).toHaveBeenCalledWith('vendorName', '保守会社A');
    expect(setValue).toHaveBeenCalledWith('emergencyContact', '03-1111-2222');
  });

  it('should set emergencyContact to empty for unknown vendor', () => {
    const setValue = createMockSetValue();
    const { result } = renderHook(() =>
      useCascadingSelects({
        setValue,
        properties: mockProperties,
        vendors: mockVendors,
        inspectionTypes: mockInspectionTypes,
        categories: mockCategories,
      }),
    );

    act(() => {
      result.current.handleVendorChange('存在しない会社');
    });

    expect(setValue).toHaveBeenCalledWith('vendorName', '存在しない会社');
    expect(setValue).toHaveBeenCalledWith('emergencyContact', '');
  });

  it('should filter inspectionTypes by category', () => {
    const setValue = createMockSetValue();
    const { result } = renderHook(() =>
      useCascadingSelects({
        setValue,
        properties: mockProperties,
        vendors: mockVendors,
        inspectionTypes: mockInspectionTypes,
        categories: mockCategories,
      }),
    );

    // 初期状態: フィルタなし
    expect(result.current.filteredInspectionTypes).toHaveLength(3);

    // カテゴリ「消防」で絞り込み
    act(() => {
      result.current.handleCategoryChange('cat1');
    });

    expect(result.current.filteredInspectionTypes).toHaveLength(2);
    expect(result.current.filteredInspectionTypes[0]!.inspection_name).toBe('消防設備点検');
    expect(result.current.filteredInspectionTypes[1]!.inspection_name).toBe('消火器点検');
  });

  it('should reset inspectionType when category changes', () => {
    const setValue = createMockSetValue();
    const { result } = renderHook(() =>
      useCascadingSelects({
        setValue,
        properties: mockProperties,
        vendors: mockVendors,
        inspectionTypes: mockInspectionTypes,
        categories: mockCategories,
      }),
    );

    act(() => {
      result.current.handleCategoryChange('cat1');
    });

    expect(setValue).toHaveBeenCalledWith('inspectionType', '');
    expect(setValue).toHaveBeenCalledWith('templateNo', '');
  });

  it('should set template fields when inspectionType changes', () => {
    const setValue = createMockSetValue();
    const { result } = renderHook(() =>
      useCascadingSelects({
        setValue,
        properties: mockProperties,
        vendors: mockVendors,
        inspectionTypes: mockInspectionTypes,
        categories: mockCategories,
      }),
    );

    act(() => {
      result.current.handleInspectionTypeChange('消防設備点検');
    });

    expect(setValue).toHaveBeenCalledWith('inspectionType', '消防設備点検');
    expect(setValue).toHaveBeenCalledWith('templateNo', 'TPL001');
    expect(setValue).toHaveBeenCalledWith('noticeText', '消防設備の点検を行います');
    expect(setValue).toHaveBeenCalledWith('frameNo', '1');
    expect(setValue).toHaveBeenCalledWith('showOnBoard', true);
  });

  it('should set showOnBoard to false for inspectionType with show_on_board=false', () => {
    const setValue = createMockSetValue();
    const { result } = renderHook(() =>
      useCascadingSelects({
        setValue,
        properties: mockProperties,
        vendors: mockVendors,
        inspectionTypes: mockInspectionTypes,
        categories: mockCategories,
      }),
    );

    act(() => {
      result.current.handleInspectionTypeChange('エレベーター点検');
    });

    expect(setValue).toHaveBeenCalledWith('showOnBoard', false);
  });

  it('should return terminals for a property', () => {
    const setValue = createMockSetValue();
    const { result } = renderHook(() =>
      useCascadingSelects({
        setValue,
        properties: mockProperties,
        vendors: mockVendors,
        inspectionTypes: mockInspectionTypes,
        categories: mockCategories,
      }),
    );

    const terminals = result.current.getTerminals('P001');
    expect(terminals).toHaveLength(2);
    expect(terminals[0]!.id).toBe('T001');
  });

  it('should return empty array for unknown property', () => {
    const setValue = createMockSetValue();
    const { result } = renderHook(() =>
      useCascadingSelects({
        setValue,
        properties: mockProperties,
        vendors: mockVendors,
        inspectionTypes: mockInspectionTypes,
        categories: mockCategories,
      }),
    );

    const terminals = result.current.getTerminals('UNKNOWN');
    expect(terminals).toHaveLength(0);
  });

  it('should generate categoryOptions from categories', () => {
    const setValue = createMockSetValue();
    const { result } = renderHook(() =>
      useCascadingSelects({
        setValue,
        properties: mockProperties,
        vendors: mockVendors,
        inspectionTypes: mockInspectionTypes,
        categories: mockCategories,
      }),
    );

    expect(result.current.categoryOptions).toEqual([
      { value: 'cat1', label: '消防' },
      { value: 'cat2', label: '設備' },
    ]);
  });
});
