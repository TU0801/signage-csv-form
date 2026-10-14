import { useCallback, useEffect, useMemo, useState } from 'react';
import { useMasterData } from '@/hooks/useMasterData';
import { fetchUnitInspections } from '@/lib/api/masterData';
import type { MasterProperty, PropertyUnit, UnitInspectionTypeOption } from '@/types/app';

/** 物件マスターで使う物件（台ごとの保守を足したもの。v1 getAllMasterData の管理者向け prop.units） */
export interface PropertyWithUnits extends MasterProperty {
  units: PropertyUnit[];
}

interface UnitData {
  unitsByProperty: Map<string, PropertyUnit[]>;
  typeOptions: UnitInspectionTypeOption[];
}

/**
 * 物件マスター用のデータ。マスターデータ（点検情報は biz から）に、台ごとの保守（管理者だけ読める）を足す。
 * **台の一覧を読み終える前に物件モーダルを開かせない**（読めていないと、台で管理している点検種別が設備情報の表に出てしまう）。
 */
// v1: js/supabase/master-data.js getAllMasterData（管理者のときの overlayUnitInspections）
export function usePropertyMasterData() {
  const master = useMasterData();
  const { refetch: refetchMaster } = master;
  const [unitData, setUnitData] = useState<UnitData | null>(null);

  const loadUnits = useCallback(async () => {
    const data = await fetchUnitInspections();
    setUnitData(data);
  }, []);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const data = await fetchUnitInspections();
      if (!cancelled) setUnitData(data);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const refetch = useCallback(async () => {
    await Promise.all([refetchMaster(), loadUnits()]);
  }, [refetchMaster, loadUnits]);

  const properties = useMemo<PropertyWithUnits[]>(
    () =>
      master.properties.map((p) => ({
        ...p,
        units: unitData?.unitsByProperty.get(p.property_code) ?? [],
      })),
    [master.properties, unitData],
  );

  return {
    properties,
    vendors: master.vendors,
    inspectionTypes: master.inspectionTypes,
    unitTypeOptions: unitData?.typeOptions ?? [],
    loading: master.loading || unitData === null,
    error: master.error,
    refetch,
  };
}
