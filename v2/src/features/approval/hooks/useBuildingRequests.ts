import { useState, useCallback } from 'react';
import { supabase, TABLES } from '@/lib/supabase';
import { useAuthStore } from '@/stores/authStore';
import { useAdminCountsStore } from '@/stores/adminCountsStore';
import type { DbBuildingVendor } from '@/types/database';
import {
  approveBuildingRequest,
  fetchPendingBuildingRequests,
  fetchProfileEmails,
  rejectBuildingRequest,
} from '@/features/relationships/api';

export interface BuildingRequestRow extends DbBuildingVendor {
  propertyName: string;
  vendorName: string;
  requesterEmail: string;
}

// v1: js/admin-relationships.js loadPendingBuildingRequests / renderPendingBuildingRequests
export function useBuildingRequests() {
  const profile = useAuthStore((s) => s.profile);
  const [requests, setRequests] = useState<BuildingRequestRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchPendingRequests = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const rows = await fetchPendingBuildingRequests();
      // v1: js/admin.js updateSidebarCounts（pendingBuildingRequests.length）
      useAdminCountsStore.getState().setBuildingRequests(rows.length);

      const propertyCodes = [...new Set(rows.map((r) => r.property_code))];
      const requesterIds = [
        ...new Set(rows.map((r) => r.requested_by).filter((id): id is string => !!id)),
      ];

      const [propertiesRes, emails] = await Promise.all([
        propertyCodes.length > 0
          ? supabase
              .from(TABLES.properties)
              .select('property_code, property_name')
              .in('property_code', propertyCodes)
          : Promise.resolve({ data: [], error: null }),
        fetchProfileEmails(requesterIds),
      ]);
      if (propertiesRes.error) throw propertiesRes.error;

      const propertyMap = new Map(
        ((propertiesRes.data ?? []) as { property_code: string; property_name: string }[]).map(
          (p) => [String(p.property_code), p.property_name],
        ),
      );

      setRequests(
        rows.map(({ signage_master_vendors, ...r }) => ({
          ...r,
          propertyName: propertyMap.get(String(r.property_code)) || '-',
          vendorName: signage_master_vendors?.vendor_name || '-',
          requesterEmail: (r.requested_by && emails.get(r.requested_by)) || '-',
        })),
      );
    } catch (err) {
      // v1 は console.error のみ（一覧は前回のまま）
      console.error('Failed to load pending building requests:', err);
      setError('ビル追加リクエストの取得に失敗しました');
    } finally {
      setLoading(false);
    }
  }, []);

  // v1: js/admin-relationships.js handleApproveBuildingRequest
  const approveRequest = useCallback(
    async (id: string) => {
      if (!profile?.id) throw new Error('ログインが必要です');
      await approveBuildingRequest(id, profile.id);
      await fetchPendingRequests();
    },
    [profile, fetchPendingRequests],
  );

  // 却下は物理削除（v1 rejectBuildingRequest と同じ）
  // v1: js/admin-relationships.js handleRejectBuildingRequest
  const rejectRequest = useCallback(
    async (id: string) => {
      await rejectBuildingRequest(id);
      await fetchPendingRequests();
    },
    [fetchPendingRequests],
  );

  return {
    requests,
    loading,
    error,
    fetchPendingRequests,
    approveRequest,
    rejectRequest,
  };
}
