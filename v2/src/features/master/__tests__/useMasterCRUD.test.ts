import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useMasterCRUD } from '../hooks/useMasterCRUD';
import type { MasterConfig } from '../types/masterConfig';

// Mock supabase
const mockSelect = vi.fn();
const mockInsert = vi.fn();
const mockUpdate = vi.fn();
const mockDeleteFn = vi.fn();
const mockOrder = vi.fn();
const mockEq = vi.fn();

vi.mock('@/lib/supabase', () => ({
  supabase: {
    from: () => ({
      select: mockSelect,
      insert: mockInsert,
      update: mockUpdate,
      delete: mockDeleteFn,
    }),
  },
  TABLES: {
    categories: 'signage_master_categories',
  },
}));

interface TestItem extends Record<string, unknown> {
  id: string;
  name: string;
  sort_order: number | null;
}

const testConfig: MasterConfig<TestItem> = {
  tableName: 'signage_master_categories',
  displayName: 'テストマスター',
  searchField: 'name',
  uniqueField: 'name',
  defaultSort: 'sort_order',
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
  { id: '1', name: 'アイテム1', sort_order: 1 },
  { id: '2', name: 'アイテム2', sort_order: 2 },
  { id: '3', name: 'テスト3', sort_order: 3 },
];

function flushPromises() {
  return act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

describe('useMasterCRUD', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSelect.mockReturnValue({ order: mockOrder });
    mockOrder.mockResolvedValue({ data: mockItems, error: null });
    mockInsert.mockResolvedValue({ error: null });
    mockUpdate.mockReturnValue({ eq: mockEq });
    mockDeleteFn.mockReturnValue({ eq: mockEq });
    mockEq.mockResolvedValue({ error: null });
  });

  it('loads items on mount', async () => {
    const { result } = renderHook(() => useMasterCRUD(testConfig));

    await flushPromises();

    expect(result.current.loading).toBe(false);
    expect(result.current.items).toEqual(mockItems);
    expect(result.current.filteredItems).toEqual(mockItems);
  });

  it('filters items by search text', async () => {
    const { result } = renderHook(() => useMasterCRUD(testConfig));

    await flushPromises();

    act(() => {
      result.current.setSearch('テスト');
    });

    expect(result.current.filteredItems).toEqual([
      { id: '3', name: 'テスト3', sort_order: 3 },
    ]);
  });

  it('filters items case-insensitively', async () => {
    const { result } = renderHook(() => useMasterCRUD(testConfig));

    await flushPromises();

    act(() => {
      result.current.setSearch('アイテム');
    });

    expect(result.current.filteredItems).toHaveLength(2);
  });

  it('addItem calls insert and reloads', async () => {
    const { result } = renderHook(() => useMasterCRUD(testConfig));

    await flushPromises();

    await act(async () => {
      await result.current.addItem({ name: '新規', sort_order: 4 });
    });

    expect(mockInsert).toHaveBeenCalledWith({ name: '新規', sort_order: 4 });
    // reload is called after insert (initial load + reload after insert)
    expect(mockSelect).toHaveBeenCalledTimes(2);
  });

  it('updateItem calls update with eq and reloads', async () => {
    const { result } = renderHook(() => useMasterCRUD(testConfig));

    await flushPromises();

    await act(async () => {
      await result.current.updateItem('1', { name: '更新済み' });
    });

    expect(mockUpdate).toHaveBeenCalledWith({ name: '更新済み' });
    expect(mockEq).toHaveBeenCalledWith('id', '1');
  });

  it('deleteItem calls delete with eq and reloads', async () => {
    const { result } = renderHook(() => useMasterCRUD(testConfig));

    await flushPromises();

    await act(async () => {
      await result.current.deleteItem('2');
    });

    expect(mockDeleteFn).toHaveBeenCalled();
    expect(mockEq).toHaveBeenCalledWith('id', '2');
  });

  it('addItem throws on supabase error', async () => {
    mockInsert.mockResolvedValueOnce({ error: { message: 'duplicate key' } });

    const { result } = renderHook(() => useMasterCRUD(testConfig));

    await flushPromises();

    await expect(
      act(async () => {
        await result.current.addItem({ name: '重複' });
      }),
    ).rejects.toThrow('duplicate key');
  });

  it('returns all items when search is empty', async () => {
    const { result } = renderHook(() => useMasterCRUD(testConfig));

    await flushPromises();

    act(() => {
      result.current.setSearch('');
    });

    expect(result.current.filteredItems).toEqual(mockItems);
  });
});
