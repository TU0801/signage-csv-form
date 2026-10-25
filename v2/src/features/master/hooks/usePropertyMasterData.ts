import { useCallback, useEffect, useMemo, useState } from 'react';
import { useMasterData } from '@/hooks/useMasterData';
import {
  fetchMasterPropertyManagementCompanies,
  fetchPropertyInspectionDates,
  fetchUnitInspections,
  inspectionDateKey,
} from '@/lib/api/masterData';
import { useAuthStore } from '@/stores/authStore';
import { managementCompanyMap, type PropertyManagementCompany } from '../lib/propertyForm';
import type { MasterProperty, PropertyUnit, UnitInspectionTypeOption } from '@/types/app';

/** 物件マスターで使う物件（台ごとの保守を足したもの。v1 getAllMasterData の管理者向け prop.units） */
export interface PropertyWithUnits extends MasterProperty {
  units: PropertyUnit[];
}

interface UnitData {
  unitsByProperty: Map<string, PropertyUnit[]>;
  typeOptions: UnitInspectionTypeOption[];
}

/** 検査月（物件コード|点検種別 → 月初の日付）。読めなかったときは null（設備情報の検査月を undefined のままにして、保存で消さない） */
async function loadInspectionDates(): Promise<Map<string, string> | null> {
  try {
    return await fetchPropertyInspectionDates();
  } catch (e) {
    console.warn('[inspection-dates] 検査月を取得できませんでした。検査月は保存時に変更しません:', e);
    return null;
  }
}

/** 物件コード → 管理会社（未設定・業務システム未連携の物件は入らない）。読めなかったときは null */
async function loadManagementCompanies(): Promise<Map<string, PropertyManagementCompany> | null> {
  try {
    return managementCompanyMap(await fetchMasterPropertyManagementCompanies());
  } catch (e) {
    console.warn('[management-companies] 物件の管理会社を取得できませんでした。管理会社の列と絞り込みを出しません:', e);
    return null;
  }
}

/**
 * 物件マスター用のデータ。マスターデータ（点検情報は biz から）に、台ごとの保守（管理者だけ読める）を足す。
 * **台の一覧を読み終える前に物件モーダルを開かせない**（読めていないと、台で管理している点検種別が設備情報の表に出てしまう）。
 */
// v1: js/supabase/master-data.js getAllMasterData（管理者のときの overlayUnitInspections）
export function usePropertyMasterData() {
  const master = useMasterData();
  const { refetch: refetchMaster } = master;
  // 管理会社は自社物件の台だけ（mgmt_unit_inspections_all）
  const role = useAuthStore((s) => s.profile?.role ?? null);
  const [unitData, setUnitData] = useState<UnitData | null>(null);
  // 検査月。undefined は読み込み中、null は読めなかった
  const [inspectionDates, setInspectionDates] = useState<Map<string, string> | null | undefined>(undefined);
  // 物件の管理会社。undefined は読み込み中、null は読めなかった（保存で変わらないので、再読み込みはしない）
  const [managementCompanies, setManagementCompanies] = useState<
    Map<string, PropertyManagementCompany> | null | undefined
  >(undefined);

  const loadUnits = useCallback(async () => {
    const [data, dates] = await Promise.all([fetchUnitInspections(role), loadInspectionDates()]);
    setUnitData(data);
    setInspectionDates(dates);
  }, [role]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const [data, dates] = await Promise.all([fetchUnitInspections(role), loadInspectionDates()]);
      if (cancelled) return;
      setUnitData(data);
      setInspectionDates(dates);
    })();
    return () => {
      cancelled = true;
    };
  }, [role]);

  useEffect(() => {
    let cancelled = false;
    void loadManagementCompanies().then((m) => {
      if (!cancelled) setManagementCompanies(m);
    });
    return () => {
      cancelled = true;
    };
  }, [role]);

  const refetch = useCallback(async () => {
    await Promise.all([refetchMaster(), loadUnits()]);
  }, [refetchMaster, loadUnits]);

  const properties = useMemo<PropertyWithUnits[]>(
    () =>
      master.properties.map((p) => ({
        ...p,
        inspections: inspectionDates
          ? p.inspections.map((i) => ({
              ...i,
              inspected_on: inspectionDates.get(inspectionDateKey(p.property_code, i.inspection_type_id)) ?? null,
            }))
          : p.inspections,
        units: unitData?.unitsByProperty.get(p.property_code) ?? [],
      })),
    [master.properties, unitData, inspectionDates],
  );

  return {
    properties,
    vendors: master.vendors,
    inspectionTypes: master.inspectionTypes,
    unitTypeOptions: unitData?.typeOptions ?? [],
    managementCompanies: managementCompanies ?? null,
    loading: master.loading || unitData === null || inspectionDates === undefined || managementCompanies === undefined,
    error: master.error,
    refetch,
  };
}
