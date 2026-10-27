import { useCallback, useEffect, useMemo, useState } from 'react';
import { useMasterData } from '@/hooks/useMasterData';
import {
  fetchMasterPropertyManagementCompanies,
  fetchPropertyInspectionDates,
  fetchUnitInspections,
  inspectionDateKey,
} from '@/lib/api/masterData';
import {
  fetchInspectionSchedules,
  fetchMasterPropertyCodes,
  type InspectionSchedules,
} from '@/lib/api/propertyMaster';
import { useAuthStore } from '@/stores/authStore';
import type { RpcInspectionScheduleRow, RpcMasterPropertyCodeRow } from '@/types/rpc';
import { managementCompanyMap, type PropertyManagementCompany } from '../lib/propertyForm';
import type { MasterProperty, PropertyUnit, UnitInspectionTypeOption } from '@/types/app';

/** 物件マスターで使う物件（台ごとの保守を足したもの。v1 getAllMasterData の管理者向け prop.units） */
export interface PropertyWithUnits extends MasterProperty {
  units: PropertyUnit[];
  /** マンションコード（補助）＝ 業務システムの物件の en_no（修正依頼1027(7)）。無ければ null、読めなかったら undefined */
  en_no?: string | null;
  /** 業務システムの物件の id（物件を開くリンク用）。業務システムと未連携・読めなかったら undefined */
  biz_property_id?: string;
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

/** 点検日連絡・インターバル・請求月（修正依頼1027(7)）。読めなかったときは null（3項目を undefined のままにして、保存で送らない） */
async function loadSchedules(): Promise<InspectionSchedules | null> {
  try {
    return await fetchInspectionSchedules();
  } catch (e) {
    console.warn('[inspection-schedules] 点検日連絡・インターバル・請求月を取得できませんでした。保存時に変更しません:', e);
    return null;
  }
}

/** 物件コード → マンションコード（補助）（修正依頼1027(7)）。読めなかったときは null（列は「-」） */
async function loadCodes(): Promise<Map<string, RpcMasterPropertyCodeRow> | null> {
  try {
    return await fetchMasterPropertyCodes();
  } catch (e) {
    console.warn('[property-codes] マンションコード（補助）を取得できませんでした:', e);
    return null;
  }
}

/** RPC の行 → 画面の3項目（行が無ければ空＝読めていない） */
function scheduleFields(r: RpcInspectionScheduleRow | undefined) {
  return r
    ? {
        notify_inspection_date: r.notify_inspection_date,
        interval_months: r.interval_months ?? null,
        billing_months: Array.isArray(r.billing_months) ? r.billing_months.map(Number) : [],
      }
    : {};
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

  // 点検日連絡・インターバル・請求月。undefined は読み込み中、null は読めなかった
  const [schedules, setSchedules] = useState<InspectionSchedules | null | undefined>(undefined);
  // マンションコード（補助）。undefined は読み込み中、null は読めなかった（保存で変わらないので、再読み込みはしない）
  const [codes, setCodes] = useState<Map<string, RpcMasterPropertyCodeRow> | null | undefined>(undefined);

  const loadUnits = useCallback(async () => {
    const [data, dates, sched] = await Promise.all([fetchUnitInspections(role), loadInspectionDates(), loadSchedules()]);
    setUnitData(data);
    setInspectionDates(dates);
    setSchedules(sched);
  }, [role]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const [data, dates, sched] = await Promise.all([fetchUnitInspections(role), loadInspectionDates(), loadSchedules()]);
      if (cancelled) return;
      setUnitData(data);
      setInspectionDates(dates);
      setSchedules(sched);
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
    void loadCodes().then((c) => {
      if (!cancelled) setCodes(c);
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
      master.properties.map((p) => {
        const code = codes ? codes.get(p.property_code) : undefined;
        const units = unitData?.unitsByProperty.get(p.property_code) ?? [];
        return {
          ...p,
          inspections: p.inspections.map((i) => ({
            ...i,
            ...(inspectionDates
              ? { inspected_on: inspectionDates.get(inspectionDateKey(p.property_code, i.inspection_type_id)) ?? null }
              : {}),
            ...(schedules
              ? scheduleFields(schedules.property.get(inspectionDateKey(p.property_code, i.inspection_type_id)))
              : {}),
          })),
          units: schedules
            ? units.map((u) => ({
                ...u,
                inspections: u.inspections.map((i) => ({
                  ...i,
                  ...(i.inspection_id ? scheduleFields(schedules.unit.get(i.inspection_id)) : {}),
                })),
              }))
            : units,
          ...(codes ? { en_no: code?.en_no ?? null } : {}),
          ...(code ? { biz_property_id: code.biz_property_id } : {}),
        };
      }),
    [master.properties, unitData, inspectionDates, schedules, codes],
  );

  return {
    properties,
    vendors: master.vendors,
    inspectionTypes: master.inspectionTypes,
    unitTypeOptions: unitData?.typeOptions ?? [],
    managementCompanies: managementCompanies ?? null,
    loading:
      master.loading ||
      unitData === null ||
      inspectionDates === undefined ||
      managementCompanies === undefined ||
      schedules === undefined ||
      codes === undefined,
    error: master.error,
    refetch,
  };
}
