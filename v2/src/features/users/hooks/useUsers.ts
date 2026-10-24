import { useState, useEffect, useCallback } from 'react';
import { supabase, TABLES } from '@/lib/supabase';
import {
  createUser,
  fetchManagementVendorIds,
  fetchOwnManagementCompany,
  setUserPassword,
  setUserStatus,
} from '@/lib/api/users';
import { fetchMasterVendors } from '@/lib/api/masterData';
import { fetchManagementCompanies } from '@/lib/api/portal';
import { useAuthStore } from '@/stores/authStore';
import type { DbProfile, DbVendor } from '@/types/database';
import type { ManagementCompanyRow } from '@/types/portal';
import { applyDefaultStartDate } from '@/features/entries-list/hooks/useEntriesFilters';
import { MIN_PASSWORD_LENGTH, companyColumns, companyRequiredError } from '../constants';

/**
 * ユーザー管理。管理会社のアカウント（修正依頼1024 C3）は:
 * - 一覧: 自社の管理会社ユーザーと、自社物件を担当する保守会社のユーザー（RLS mgmt_select_profiles が絞る）
 * - 作成: 自社の管理会社ユーザーと、自社物件を担当する保守会社のユーザー（保守会社の候補も絞る。Edge Function が確かめる）
 * - 編集はパスワードだけ、無効化・有効化も Edge Function 経由で、自社の管理会社ユーザーだけ（保守会社のユーザーは閲覧のみ）
 */
export function useUsers() {
  const currentUserId = useAuthStore((s) => s.user?.id ?? null);
  const isManagement = useAuthStore((s) => s.profile?.role === 'management');
  const [users, setUsers] = useState<DbProfile[]>([]);
  const [vendors, setVendors] = useState<DbVendor[]>([]);
  const [managementCompanies, setManagementCompanies] = useState<ManagementCompanyRow[]>([]);
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
      if (isManagement) {
        // 管理会社: 自社物件を担当する保守会社だけ（作成の候補・一覧の会社名）
        const [all, ids] = await Promise.all([fetchMasterVendors(), fetchManagementVendorIds()]);
        setVendors(all.filter((v) => ids.has(String(v.id))));
        return;
      }
      setVendors(await fetchMasterVendors());
    } catch (err) {
      console.error('Failed to load vendors:', err);
    }
  }, [isManagement]);

  // 管理会社アカウントの作成・付け替えと一覧の社名に使う（RPC management_companies_master。管理者だけ行が返る）
  // 管理会社のアカウントは自社だけ（management_companies_master は管理者専用）
  const fetchManagementCompanyList = useCallback(async () => {
    try {
      setManagementCompanies(isManagement ? await fetchOwnManagementCompany() : await fetchManagementCompanies());
    } catch (err) {
      console.error('Failed to load management companies:', err);
    }
  }, [isManagement]);

  useEffect(() => {
    fetchUsers();
    fetchVendors();
    fetchManagementCompanyList();
  }, [fetchUsers, fetchVendors, fetchManagementCompanyList]);

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
      management_company_id?: string | null;
    }) => {
      const columns = companyColumns(params.role, params.vendor_id, params.management_company_id ?? null);
      const companyError = companyRequiredError(params.role, columns.vendor_id, columns.management_company_id);
      if (companyError) throw new Error(companyError);
      if (params.password.length < MIN_PASSWORD_LENGTH) {
        throw new Error(`パスワードは${MIN_PASSWORD_LENGTH}文字以上で入力してください`);
      }
      await createUser({
        email: params.email,
        password: params.password,
        role: params.role,
        vendorId: columns.vendor_id,
        managementCompanyId: columns.management_company_id,
      });
      await fetchUsers();
    },
    [fetchUsers],
  );

  /**
   * 権限・保守会社・管理会社の変更と、入力があればパスワード変更。
   * 保守会社→管理会社の付け替えもここで行う（会社の列は companyColumns で role に合わせてそろえる）。
   * パスワード変更（共用アカウント等で拒否され得る）を先に行い、失敗したら権限・保守会社も保存しない。
   * 戻り値はパスワードを変えたかどうか。
   */
  // v1: js/admin-users.js handleEditUserSubmit
  const editUser = useCallback(
    async (
      id: string,
      params: {
        role: DbProfile['role'];
        vendor_id: string | null;
        management_company_id?: string | null;
        password?: string;
      },
    ): Promise<boolean> => {
      assertNotSelf(id, '自分は編集できません');
      const columns = companyColumns(params.role, params.vendor_id, params.management_company_id ?? null);
      const companyError = companyRequiredError(params.role, columns.vendor_id, columns.management_company_id);
      if (companyError) throw new Error(companyError);
      const newPassword = params.password ?? '';
      if (newPassword && newPassword.length < MIN_PASSWORD_LENGTH) {
        throw new Error(`パスワードは${MIN_PASSWORD_LENGTH}文字以上で入力してください`);
      }

      // 管理会社は権限・会社を変えられない（パスワードだけ。範囲は Edge Function が確かめる）
      if (isManagement) {
        if (newPassword) await setUserPassword(id, newPassword);
        await fetchUsers();
        return !!newPassword;
      }

      if (newPassword) {
        await setUserPassword(id, newPassword);
      }
      // RLS で UPDATE が素通り（0行）になったときもエラーにする（select().single()）
      // v1: js/supabase/users.js updateUserProfile
      const { error: err } = await supabase
        .from(TABLES.profiles)
        .update({ role: params.role, ...columns })
        .eq('id', id)
        .select()
        .single();
      if (err) {
        if (!newPassword) throw err;
        // パスワードは変わっているので、それが伝わるように分けて知らせる
        throw new Error(`パスワードは変更済みですが、権限・会社の保存に失敗しました（${err.message}）`);
      }
      // v1: js/admin-users.js handleEditUserSubmit（reloadAll = loadAllData。データ一覧の開始日が空なら今日に戻る）
      applyDefaultStartDate();
      await fetchUsers();
      return !!newPassword;
    },
    [assertNotSelf, fetchUsers, isManagement],
  );

  /** 無効化（'inactive'）・有効化（'active'）。無効化されたユーザーはログインできない */
  // v1: js/supabase/users.js updateUserStatus（js/admin-users.js handleDeactivateUser / handleActivateUser）
  const updateUserStatus = useCallback(
    async (id: string, status: DbProfile['status']) => {
      assertNotSelf(
        id,
        status === 'inactive' ? '自分を無効化することはできません' : '自分の状態は変更できません',
      );
      if (isManagement) {
        // 管理会社は profiles の状態の列を直接は変えられない（guard_profile_privileged_columns）
        await setUserStatus(id, status);
        await fetchUsers();
        return;
      }
      const { error: err } = await supabase
        .from(TABLES.profiles)
        .update({ status })
        .eq('id', id)
        .select()
        .single();
      if (err) throw err;
      await fetchUsers();
    },
    [assertNotSelf, fetchUsers, isManagement],
  );

  return {
    users,
    vendors,
    managementCompanies,
    currentUserId,
    isManagement,
    loading,
    error,
    refetch: fetchUsers,
    addUser,
    editUser,
    updateUserStatus,
  };
}
