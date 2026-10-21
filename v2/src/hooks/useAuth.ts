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
    /** 管理会社のアカウント（点検ポータルだけを使う。1件入力・一括入力には入れない） */
    isManagement: profile?.role === 'management',
    vendorId: profile?.vendor_id,
    managementCompanyId: profile?.management_company_id ?? null,
  };
}
