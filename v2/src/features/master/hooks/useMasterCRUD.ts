import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import type { MasterConfig } from '../types/masterConfig';

interface UseMasterCRUDReturn<T extends Record<string, unknown>> {
  items: T[];
  filteredItems: T[];
  loading: boolean;
  search: string;
  setSearch: (value: string) => void;
  reload: () => Promise<void>;
  addItem: (data: Partial<T>) => Promise<void>;
  updateItem: (id: string, data: Partial<T>) => Promise<void>;
  deleteItem: (id: string) => Promise<void>;
}

export function useMasterCRUD<T extends Record<string, unknown>>(
  config: MasterConfig<T>,
): UseMasterCRUDReturn<T> {
  const [items, setItems] = useState<T[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from(config.tableName)
        .select('*')
        .order(config.defaultSort, { ascending: true });

      if (error) throw error;
      setItems((data as T[]) ?? []);
    } finally {
      setLoading(false);
    }
  }, [config.tableName, config.defaultSort]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const filteredItems = items.filter((item) => {
    if (!search) return true;
    const value = item[config.searchField];
    if (typeof value === 'string') {
      return value.toLowerCase().includes(search.toLowerCase());
    }
    return true;
  });

  const addItem = useCallback(
    async (data: Partial<T>) => {
      const { error } = await supabase.from(config.tableName).insert(data);
      if (error) throw new Error(error.message);
      await reload();
    },
    [config.tableName, reload],
  );

  const updateItem = useCallback(
    async (id: string, data: Partial<T>) => {
      const { error } = await supabase.from(config.tableName).update(data).eq('id', id);
      if (error) throw new Error(error.message);
      await reload();
    },
    [config.tableName, reload],
  );

  const deleteItem = useCallback(
    async (id: string) => {
      const { error } = await supabase.from(config.tableName).delete().eq('id', id);
      if (error) throw new Error(error.message);
      await reload();
    },
    [config.tableName, reload],
  );

  return {
    items,
    filteredItems,
    loading,
    search,
    setSearch,
    reload,
    addItem,
    updateItem,
    deleteItem,
  };
}
