import { RPC } from '@/lib/supabase';

/**
 * 物件の点検情報の RPC 名。管理会社は自社が管理する物件だけを扱う mgmt_*（scripts/fix-1024-mgmt.sql）を使い、
 * 管理者・保守会社は従来の RPC を使う。戻り値の形はどちらも同じ
 */
export function inspectionRpc(role: string | null | undefined) {
  const m = role === 'management';
  return {
    inspectionsAll: m ? RPC.mgmtInspectionsAll : RPC.inspectionsAll,
    inspectionsForProperty: m ? RPC.mgmtInspectionsForProperty : RPC.inspectionsForProperty,
    upsertPropertyInspection: m ? RPC.mgmtUpsertPropertyInspection : RPC.upsertPropertyInspection,
    deletePropertyInspection: m ? RPC.mgmtDeletePropertyInspection : RPC.deletePropertyInspection,
    unitInspectionsAll: m ? RPC.mgmtUnitInspectionsAll : RPC.unitInspectionsAll,
    unitInspectionTypeOptions: m ? RPC.mgmtUnitInspectionTypeOptions : RPC.unitInspectionTypeOptions,
    upsertUnitInspection: m ? RPC.mgmtUpsertUnitInspection : RPC.upsertUnitInspection,
    deleteUnitInspection: m ? RPC.mgmtDeleteUnitInspection : RPC.deleteUnitInspection,
  };
}
