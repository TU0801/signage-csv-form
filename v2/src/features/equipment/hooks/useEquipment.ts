import { useState, useEffect, useCallback } from 'react';
import { supabase, TABLES } from '@/lib/supabase';
import type { DbBuildingEquipment } from '@/types/database';

export function useEquipment(propertyCode: string) {
  const [items, setItems] = useState<DbBuildingEquipment[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchItems = useCallback(async () => {
    if (!propertyCode) {
      setItems([]);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const { data, error: err } = await supabase
        .from(TABLES.buildingEquipment)
        .select('*')
        .eq('property_code', propertyCode)
        .order('created_at');
      if (err) throw err;
      setItems((data ?? []) as DbBuildingEquipment[]);
    } catch (err) {
      setError(err instanceof Error ? err.message : '設備データの取得に失敗しました');
    } finally {
      setLoading(false);
    }
  }, [propertyCode]);

  useEffect(() => {
    fetchItems();
  }, [fetchItems]);

  const addItem = useCallback(
    async (data: Omit<DbBuildingEquipment, 'id' | 'created_at' | 'updated_at'>) => {
      const { error: err } = await supabase.from(TABLES.buildingEquipment).insert(data);
      if (err) throw new Error('設備の追加に失敗しました: ' + err.message);
      await fetchItems();
    },
    [fetchItems],
  );

  const deleteItem = useCallback(
    async (id: string) => {
      const { error: err } = await supabase
        .from(TABLES.buildingEquipment)
        .delete()
        .eq('id', id);
      if (err) throw new Error('設備の削除に失敗しました: ' + err.message);
      await fetchItems();
    },
    [fetchItems],
  );

  return { items, loading, error, addItem, deleteItem, refetch: fetchItems };
}
