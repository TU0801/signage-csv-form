import { useState, useEffect, useCallback, useRef } from 'react';
import { BuildingVendorStatus } from '@/lib/constants';
import {
  addBuildingVendor as apiAddBuildingVendor,
  removeBuildingVendor as apiRemoveBuildingVendor,
} from '@/lib/api/relationships';
import { fetchMasterInspectionTypes, fetchMasterProperties } from '@/lib/api/masterData';
import { useAuthStore } from '@/stores/authStore';
import type { DbBuildingVendor, DbInspectionType, DbProperty } from '@/types/database';
import {
  addVendorInspection as apiAddVendorInspection,
  availablePropertiesForVendor,
  fetchBuildingVendors,
  fetchVendorInspections,
  removeVendorInspection as apiRemoveVendorInspection,
  summarizeAddResults,
  type AddSummary,
  type VendorInspectionWithType,
} from '../api';

export type RelationshipTab = 'buildings' | 'inspections';

/** 読み込み失敗。失敗のたびに新しいオブジェクトを作るので、同じ文言の失敗が続いても毎回通知できる */
export interface LoadError {
  message: string;
}

interface BuildingState {
  vendorId: string;
  rels: DbBuildingVendor[];
  properties: DbProperty[];
  error: LoadError | null;
}

interface InspectionState {
  vendorId: string;
  rels: VendorInspectionWithType[];
  error: LoadError | null;
}

export function useRelationships(vendorId: string | null, activeTab: RelationshipTab = 'buildings') {
  const profile = useAuthStore((s) => s.profile);
  // 取得結果は保守会社の id 付きで持ち、今の保守会社のものだけを返す（切り替え直後に前の保守会社の行を出さない）
  const [buildingState, setBuildingState] = useState<BuildingState | null>(null);
  const [inspectionState, setInspectionState] = useState<InspectionState | null>(null);
  // 保守会社を続けて切り替えたとき、前の保守会社の遅れた応答で上書きしない
  const latestVendorRef = useRef(vendorId);
  useEffect(() => {
    latestVendorRef.current = vendorId;
  }, [vendorId]);

  // v1: js/admin-relationships.js loadBuildingVendorRelationships
  const loadBuildings = useCallback(async () => {
    if (!vendorId) return;
    let next: BuildingState;
    try {
      const [rels, properties] = await Promise.all([
        fetchBuildingVendors(vendorId),
        fetchMasterProperties(),
      ]);
      next = { vendorId, rels, properties, error: null };
    } catch {
      next = { vendorId, rels: [], properties: [], error: { message: '紐付け情報の読み込みに失敗しました' } };
    }
    if (latestVendorRef.current === vendorId) setBuildingState(next);
  }, [vendorId]);

  // v1: js/admin-relationships.js loadVendorInspectionRelationships
  const loadInspections = useCallback(async () => {
    if (!vendorId) return;
    let next: InspectionState;
    try {
      next = { vendorId, rels: await fetchVendorInspections(vendorId), error: null };
    } catch {
      next = { vendorId, rels: [], error: { message: '点検種別紐付け情報の読み込みに失敗しました' } };
    }
    if (latestVendorRef.current === vendorId) setInspectionState(next);
  }, [vendorId]);

  // 表示中のサブタブだけを読み、保守会社やサブタブを切り替えるたびに読み直す
  // v1: js/admin-relationships.js initRelationshipsTab（data-rel-type クリック）/ loadRelationships
  useEffect(() => {
    if (activeTab === 'buildings') loadBuildings();
    else loadInspections();
  }, [activeTab, loadBuildings, loadInspections]);

  const currentBuildings = buildingState && buildingState.vendorId === vendorId ? buildingState : null;
  const currentInspections =
    inspectionState && inspectionState.vendorId === vendorId ? inspectionState : null;
  const buildingVendors = currentBuildings?.rels ?? [];
  const properties = currentBuildings?.properties ?? [];
  const vendorInspections = currentInspections?.rels ?? [];
  // 読み直し中は前の表を出したままにする（v1 も描き終わるまで前の表が残る）。初回だけスピナー
  const loading = !!vendorId && !(activeTab === 'buildings' ? currentBuildings : currentInspections);
  const buildingError = currentBuildings?.error ?? null;
  const inspectionError = currentInspections?.error ?? null;

  // 表は active だけ（v1 renderBuildingVendorRelationships の activeRelationships）
  const activeBuildingVendors = buildingVendors.filter((r) => r.status === BuildingVendorStatus.ACTIVE);

  /** 追加モーダルを開く直前に、物件と紐付けを読み直して候補を返す */
  // v1: js/admin-relationships.js openAddBuildingModal
  const loadAvailableProperties = useCallback(async () => {
    if (!vendorId) return [];
    const [allProperties, linked] = await Promise.all([
      fetchMasterProperties(),
      fetchBuildingVendors(vendorId),
    ]);
    return availablePropertiesForVendor(allProperties, linked);
  }, [vendorId]);

  /** 紐付け済み（active）を除いた点検種別 */
  // v1: js/admin-relationships.js openAddInspectionModal
  const loadAvailableInspectionTypes = useCallback(async (): Promise<DbInspectionType[]> => {
    if (!vendorId) return [];
    const [all, linked] = await Promise.all([fetchMasterInspectionTypes(), fetchVendorInspections(vendorId)]);
    const linkedIds = new Set(linked.map((r) => r.inspection_id));
    return all.filter((i) => !linkedIds.has(i.id));
  }, [vendorId]);

  // 追加は解除済みの行を UPDATE で戻す（共有 api。UNIQUE(property_code, vendor_id) がある）
  // v1: js/admin-relationships.js confirmBuildingSelection
  const addBuildingVendors = useCallback(
    async (propertyCodes: string[]): Promise<AddSummary> => {
      if (!vendorId) throw new Error('保守会社が選択されていません');
      try {
        const results = await Promise.allSettled(
          propertyCodes.map((code) => apiAddBuildingVendor({ propertyCode: code, vendorId, profile })),
        );
        return summarizeAddResults(results, '物件');
      } finally {
        await loadBuildings();
      }
    },
    [vendorId, profile, loadBuildings],
  );

  // v1: js/admin-relationships.js handleRemoveBuildingVendor
  const removeBuildingVendor = useCallback(
    async (id: string) => {
      await apiRemoveBuildingVendor(id);
      await loadBuildings();
    },
    [loadBuildings],
  );

  // v1: js/admin-relationships.js confirmInspectionSelection
  const addVendorInspections = useCallback(
    async (inspectionIds: string[]): Promise<AddSummary> => {
      if (!vendorId) throw new Error('保守会社が選択されていません');
      try {
        const results = await Promise.allSettled(
          inspectionIds.map((id) => apiAddVendorInspection(vendorId, id)),
        );
        return summarizeAddResults(results, '点検種別');
      } finally {
        await loadInspections();
      }
    },
    [vendorId, loadInspections],
  );

  // v1: js/admin-relationships.js handleRemoveVendorInspection
  const removeVendorInspection = useCallback(
    async (id: string) => {
      await apiRemoveVendorInspection(id);
      await loadInspections();
    },
    [loadInspections],
  );

  return {
    buildingVendors,
    activeBuildingVendors,
    properties,
    vendorInspections,
    loading,
    buildingError,
    inspectionError,
    loadAvailableProperties,
    loadAvailableInspectionTypes,
    addBuildingVendors,
    removeBuildingVendor,
    addVendorInspections,
    removeVendorInspection,
  };
}
