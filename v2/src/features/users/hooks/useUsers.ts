import { useState, useEffect, useCallback } from 'react';
import { supabase, TABLES } from '@/lib/supabase';
import { createUser, setUserPassword } from '@/lib/api/users';
import { fetchMasterVendors } from '@/lib/api/masterData';
import { useAuthStore } from '@/stores/authStore';
import type { DbProfile, DbVendor } from '@/types/database';
import { applyDefaultStartDate } from '@/features/entries-list/hooks/useEntriesFilters';
import { MIN_PASSWORD_LENGTH } from '../constants';

export function useUsers() {
  const currentUserId = useAuthStore((s) => s.user?.id ?? null);
  const [users, setUsers] = useState<DbProfile[]>([]);
  const [vendors, setVendors] = useState<DbVendor[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // v1: js/supabase/users.js getAllProfiles（登録の新しい順）
  const fetchUsers = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const { data, error: err } = await supabase
        .from(TABLES.profiles)
        .select('*')
        .order('created_at', { ascending: false });
      if (err) throw err;
      setUsers((data ?? []) as DbProfile[]);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'ユーザー一覧の取得に失敗しました');
    } finally {
      setLoading(false);
    }
  }, []);

  // v1: js/admin-users.js openUserModal / loadUsers の保守会社（getMasterVendors。保守会社名順）
  const fetchVendors = useCallback(async () => {
    try {
      setVendors(await fetchMasterVendors());
    } catch (err) {
      console.error('Failed to load vendors:', err);
    }
  }, []);

  useEffect(() => {
    fetchUsers();
    fetchVendors();
  }, [fetchUsers, fetchVendors]);

  // 自分自身は編集・無効化できない（v1 は自分の行の「編集」を無効化し「無効化」を出さない）
  // v1: js/admin-users.js loadUsers の isSelf
  const assertNotSelf = useCallback(
    (id: string, message: string) => {
      if (currentUserId && id === currentUserId) throw new Error(message);
    },
    [currentUserId],
  );

  // 認証ユーザーとプロファイルは Edge Function が作る（profiles には INSERT ポリシーが無い）
  // v1: js/admin-users.js handleUserFormSubmit
  const addUser = useCallback(
    async (params: {
      email: string;
      password: string;
      role: DbProfile['role'];
      vendor_id: string | null;
    }) => {
      // 保守会社は一般ユーザーのみ必須（管理者は保守会社なしで運用している）
      if (params.role !== 'admin' && !params.vendor_id) {
        throw new Error('保守会社を選択してください');
      }
      if (params.password.length < MIN_PASSWORD_LENGTH) {
        throw new Error(`パスワードは${MIN_PASSWORD_LENGTH}文字以上で入力してください`);
      }
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

  /**
   * 権限・保守会社の変更と、入力があればパスワード変更。
   * パスワード変更（共用アカウント等で拒否され得る）を先に行い、失敗したら権限・保守会社も保存しない。
   * 戻り値はパスワードを変えたかどうか。
   */
  // v1: js/admin-users.js handleEditUserSubmit
  const editUser = useCallback(
    async (
      id: string,
      params: { role: DbProfile['role']; vendor_id: string | null; password?: string },
    ): Promise<boolean> => {
      assertNotSelf(id, '自分は編集できません');
      if (params.role !== 'admin' && !params.vendor_id) {
        throw new Error('保守会社を選択してください');
      }
      const newPassword = params.password ?? '';
      if (newPassword && newPassword.length < MIN_PASSWORD_LENGTH) {
        throw new Error(`パスワードは${MIN_PASSWORD_LENGTH}文字以上で入力してください`);
      }

      if (newPassword) {
        await setUserPassword(id, newPassword);
      }
      // RLS で UPDATE が素通り（0行）になったときもエラーにする（select().single()）
      // v1: js/supabase/users.js updateUserProfile
      const { error: err } = await supabase
        .from(TABLES.profiles)
        .update({ role: params.role, vendor_id: params.vendor_id })
        .eq('id', id)
        .select()
        .single();
      if (err) {
        if (!newPassword) throw err;
        // パスワードは変わっているので、それが伝わるように分けて知らせる
        throw new Error(`パスワードは変更済みですが、権限・保守会社の保存に失敗しました（${err.message}）`);
      }
      // v1: js/admin-users.js handleEditUserSubmit（reloadAll = loadAllData。データ一覧の開始日が空なら今日に戻る）
      applyDefaultStartDate();
      await fetchUsers();
      return !!newPassword;
    },
    [assertNotSelf, fetchUsers],
  );

  /** 無効化（'inactive'）・有効化（'active'）。無効化されたユーザーはログインできない */
  // v1: js/supabase/users.js updateUserStatus（js/admin-users.js handleDeactivateUser / handleActivateUser）
  const updateUserStatus = useCallback(
    async (id: string, status: DbProfile['status']) => {
      assertNotSelf(
        id,
        status === 'inactive' ? '自分を無効化することはできません' : '自分の状態は変更できません',
      );
      const { error: err } = await supabase
        .from(TABLES.profiles)
        .update({ status })
        .eq('id', id)
        .select()
        .single();
      if (err) throw err;
      await fetchUsers();
    },
    [assertNotSelf, fetchUsers],
  );

  return {
    users,
    vendors,
    currentUserId,
    loading,
    error,
    refetch: fetchUsers,
    addUser,
    editUser,
    updateUserStatus,
  };
}
