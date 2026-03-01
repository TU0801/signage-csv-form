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
    vendorId: profile?.vendor_id,
  };
}
