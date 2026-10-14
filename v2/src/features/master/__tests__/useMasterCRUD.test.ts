import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useMasterCRUD } from '../hooks/useMasterCRUD';
import type { MasterConfig } from '../types/masterConfig';

interface TestItem extends Record<string, unknown> {
  id: string;
  name: string;
  code: string;
  sort_order: number | null;
}

const mockList = vi.fn();
const mockAdd = vi.fn();
const mockUpdate = vi.fn();
const mockRemove = vi.fn();

const testConfig: MasterConfig<TestItem> = {
  api: { list: mockList, add: mockAdd, update: mockUpdate, remove: mockRemove },
  displayName: 'テストマスター',
  searchFields: ['code', 'name'],
  labelField: 'name',
  columns: [
    { key: 'name', label: '名前' },
    { key: 'sort_order', label: '表示順' },
  ],
  formFields: [
    { name: 'name', label: '名前', type: 'text', required: true },
    { name: 'sort_order', label: '表示順', type: 'number' },
  ],
  defaultValues: { name: '', sort_order: 0 },
};

const mockItems: TestItem[] = [
  { id: '1', name: 'アイテム1', code: 'z0023A01', sort_order: 1 },
  { id: '2', name: 'アイテム2', code: '120273-00', sort_order: 2 },
  { id: '3', name: 'テスト3', code: 'X3', sort_order: 3 },
];

function flushPromises() {
  return act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

describe('useMasterCRUD', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockList.mockResolvedValue(mockItems);
    mockAdd.mockResolvedValue(undefined);
    mockUpdate.mockResolvedValue(undefined);
    mockRemove.mockResolvedValue(undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('loads items on mount through config.api.list', async () => {
    const { result } = renderHook(() => useMasterCRUD(testConfig));
    await flushPromises();

    expect(result.current.loading).toBe(false);
    expect(result.current.items).toEqual(mockItems);
    expect(mockList).toHaveBeenCalledTimes(1);
  });

  // v1 loadAllData: 取得失敗は文言で知らせる（「登録されていません」にしない）
  it('keeps a load failure as error instead of an unhandled rejection', async () => {
    mockList.mockRejectedValueOnce(new Error('permission denied'));
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const { result } = renderHook(() => useMasterCRUD(testConfig));
    await flushPromises();

    expect(result.current.loading).toBe(false);
    expect(result.current.items).toEqual([]);
    expect(result.current.error).toBe('テストマスターの取得に失敗しました');
  });

  // v1 renderProperties: `${code} ${name}` を大文字小文字を区別せず部分一致
  it('searches across all searchFields, case-insensitively', async () => {
    const { result } = renderHook(() => useMasterCRUD(testConfig));
    await flushPromises();

    act(() => result.current.setSearch('z0023a'));
    expect(result.current.filteredItems.map((i) => i.id)).toEqual(['1']);

    act(() => result.current.setSearch('テスト'));
    expect(result.current.filteredItems.map((i) => i.id)).toEqual(['3']);
  });

  it('add / update / remove go through config.api and reload', async () => {
    const { result } = renderHook(() => useMasterCRUD(testConfig));
    await flushPromises();

    await act(async () => {
      await result.current.addItem({ name: '新規' });
      await result.current.updateItem('1', { name: '更新済み' });
      await result.current.deleteItem('2');
    });

    expect(mockAdd).toHaveBeenCalledWith({ name: '新規' });
    expect(mockUpdate).toHaveBeenCalledWith('1', { name: '更新済み' });
    expect(mockRemove).toHaveBeenCalledWith('2');
    expect(mockList).toHaveBeenCalledTimes(4);
  });

  it('rejects writes on a read-only master (no api.add)', async () => {
    const readOnly: MasterConfig<TestItem> = { ...testConfig, api: { list: mockList }, readOnly: true };
    const { result } = renderHook(() => useMasterCRUD(readOnly));
    await flushPromises();

    await expect(
      act(async () => {
        await result.current.addItem({ name: 'x' });
      }),
    ).rejects.toThrow('追加できないマスターです');
  });
});
