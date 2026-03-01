import { useState, useEffect, useCallback } from 'react';
import { supabase, TABLES } from '@/lib/supabase';
import type { DbProfile } from '@/types/database';

export function useUsers() {
  const [users, setUsers] = useState<DbProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchUsers = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const { data, error: err } = await supabase
        .from(TABLES.profiles)
        .select('*')
        .order('created_at');
      if (err) throw err;
      setUsers((data ?? []) as DbProfile[]);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'ユーザー一覧の取得に失敗しました');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchUsers();
  }, [fetchUsers]);

  const addUser = useCallback(
    async (params: { id: string; email: string; role: DbProfile['role']; vendor_id: string | null }) => {
      const { error: err } = await supabase.from(TABLES.profiles).insert({
        id: params.id,
        email: params.email,
        role: params.role,
        vendor_id: params.vendor_id || null,
      });
      if (err) throw err;
      await fetchUsers();
    },
    [fetchUsers],
  );

  const updateUser = useCallback(
    async (id: string, params: { role?: DbProfile['role']; vendor_id?: string | null }) => {
      const { error: err } = await supabase
        .from(TABLES.profiles)
        .update(params)
        .eq('id', id);
      if (err) throw err;
      await fetchUsers();
    },
    [fetchUsers],
  );

  const deleteUser = useCallback(
    async (id: string) => {
      const { error: err } = await supabase.from(TABLES.profiles).delete().eq('id', id);
      if (err) throw err;
      await fetchUsers();
    },
    [fetchUsers],
  );

  return {
    users,
    loading,
    error,
    refetch: fetchUsers,
    addUser,
    updateUser,
    deleteUser,
  };
}
