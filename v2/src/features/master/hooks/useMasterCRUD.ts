import { useState, useEffect, useCallback } from 'react';
import type { MasterConfig } from '../types/masterConfig';

interface UseMasterCRUDReturn<T extends Record<string, unknown>> {
  items: T[];
  filteredItems: T[];
  loading: boolean;
  /** 一覧の取得に失敗したときの文言。null なら成功 */
  error: string | null;
  search: string;
  setSearch: (value: string) => void;
  reload: () => Promise<void>;
  addItem: (data: Partial<T>) => Promise<void>;
  updateItem: (id: string, data: Partial<T>) => Promise<void>;
  deleteItem: (id: string) => Promise<void>;
}

/** 検索語を含むか（v1 render* の filter: 対象列を空白でつなぎ、大文字小文字を区別せず部分一致） */
// v1: js/admin-masters.js renderProperties / renderInspections / renderCategories / renderVendors の filter
export function matchesSearch<T extends Record<string, unknown>>(
  item: T,
  fields: (keyof T & string)[],
  search: string,
): boolean {
  if (!search) return true;
  const text = fields.map((f) => String(item[f] ?? '')).join(' ');
  return text.toLowerCase().includes(search.toLowerCase());
}

// マスター管理のタブを切り替えても検索語を残す（タブごとに部品が作り直されるので、部品の外に持つ）。再読込で消える
const rememberedSearch = new Map<string, string>();

/** key を渡すと、部品を作り直しても同じ key の検索語を引き継ぐ（タブの行き来用） */
export function useRememberedSearch(key?: string): [string, (value: string) => void] {
  const [search, setSearchState] = useState(() => (key ? (rememberedSearch.get(key) ?? '') : ''));
  const setSearch = useCallback(
    (value: string) => {
      if (key) rememberedSearch.set(key, value);
      setSearchState(value);
    },
    [key],
  );
  return [search, setSearch];
}

export function useMasterCRUD<T extends Record<string, unknown>>(
  config: MasterConfig<T>,
  options: { rememberSearchAs?: string } = {},
): UseMasterCRUDReturn<T> {
  const { api } = config;
  const [items, setItems] = useState<T[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useRememberedSearch(options.rememberSearchAs);

  const reload = useCallback(async () => {
    try {
      setItems(await api.list());
      setError(null);
    } catch (err) {
      // v1: js/admin.js loadAllData（取得に失敗したら「一部データの取得に失敗しました」を出す）
      console.error(`Failed to load ${config.displayName}:`, err);
      setError(`${config.displayName}の取得に失敗しました`);
    } finally {
      setLoading(false);
    }
  }, [api, config.displayName]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const filteredItems = items.filter((item) => matchesSearch(item, config.searchFields, search));

  const addItem = useCallback(
    async (data: Partial<T>) => {
      if (!api.add) throw new Error('追加できないマスターです');
      await api.add(data);
      await reload();
    },
    [api, reload],
  );

  const updateItem = useCallback(
    async (id: string, data: Partial<T>) => {
      if (!api.update) throw new Error('更新できないマスターです');
      await api.update(id, data);
      await reload();
    },
    [api, reload],
  );

  const deleteItem = useCallback(
    async (id: string) => {
      if (!api.remove) throw new Error('削除できないマスターです');
      await api.remove(id);
      await reload();
    },
    [api, reload],
  );

  return {
    items,
    filteredItems,
    loading,
    error,
    search,
    setSearch,
    reload,
    addItem,
    updateItem,
    deleteItem,
  };
}
