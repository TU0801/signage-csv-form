import { useAuthStore } from '@/stores/authStore';

export function useAuth() {
  const { user, profile, session, loading, initialized } = useAuthStore();

  return {
    user,
    profile,
    session,
    loading,
    initialized,
    isAuthenticated: !!user,
    isAdmin: profile?.role === 'admin',
    /** 管理会社のアカウント（自社物件の点検の予定入力・報告書の登録と、承認・差戻し。修正依頼1115 (2)） */
    isManagement: profile?.role === 'management',
    vendorId: profile?.vendor_id,
    managementCompanyId: profile?.management_company_id ?? null,
  };
}
