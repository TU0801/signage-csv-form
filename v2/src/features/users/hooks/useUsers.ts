import { useState, useEffect, useCallback } from 'react';
import { supabase, TABLES } from '@/lib/supabase';
import { createUser } from '@/lib/api/users';
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

  // 認証ユーザーとプロファイルは Edge Function が作る（profiles には INSERT ポリシーが無い）
  const addUser = useCallback(
    async (params: {
      email: string;
      password: string;
      role: DbProfile['role'];
      vendor_id: string | null;
    }) => {
      await createUser({
        email: params.email,
        password: params.password,
        role: params.role,
        vendorId: params.vendor_id || null,
      });
      await fetchUsers();
    },
    [fetchUsers],
  );

  const updateUser = useCallback(
    async (
      id: string,
      params: { role?: DbProfile['role']; vendor_id?: string | null; status?: DbProfile['status'] },
    ) => {
      // RLS で UPDATE が素通り（0行）になったときもエラーにする（v1 users.js updateUserStatus と同じ select().single()）
      const { error: err } = await supabase
        .from(TABLES.profiles)
        .update(params)
        .eq('id', id)
        .select()
        .single();
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
  };
}
