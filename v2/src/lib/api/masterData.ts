import { supabase, TABLES, RPC } from '@/lib/supabase';
import { toTerminal } from '@/lib/terminal';
import type {
  DbProfile,
  DbProperty,
  DbVendor,
  DbInspectionType,
  DbCategory,
  DbTemplateImage,
} from '@/types/database';
import type {
  MasterData,
  MasterProperty,
  PropertyInspection,
  PropertyUnit,
  UnitInspectionTypeOption,
} from '@/types/app';
import type { RpcInspectionRow, RpcUnitInspectionRow } from '@/types/rpc';
import { getAssignedBuildings } from './relationships';

// v1: js/supabase/master-data.js getMasterProperties
export async function fetchMasterProperties(): Promise<DbProperty[]> {
  const { data, error } = await supabase.from(TABLES.properties).select('*').order('property_code');
  if (error) throw error;
  return (data ?? []) as DbProperty[];
}

/** 保守会社は読むだけ（正本は biz の取引先。sync_maintainer_to_signage が写す） */
// v1: js/supabase/master-data.js getMasterVendors
export async function fetchMasterVendors(): Promise<DbVendor[]> {
  const { data, error } = await supabase.from(TABLES.vendors).select('*').order('vendor_name');
  if (error) throw error;
  return (data ?? []) as DbVendor[];
}

// v1: js/supabase/master-data.js getMasterInspectionTypes
export async function fetchMasterInspectionTypes(): Promise<DbInspectionType[]> {
  const { data, error } = await supabase
    .from(TABLES.inspectionTypes)
    .select('*')
    .order('sort_order')
    .order('template_no');
  if (error) throw error;
  return (data ?? []) as DbInspectionType[];
}

// v1: js/supabase/master-data.js getMasterCategories
export async function fetchMasterCategories(): Promise<DbCategory[]> {
  const { data, error } = await supabase.from(TABLES.categories).select('*').order('sort_order');
  if (error) throw error;
  return (data ?? []) as DbCategory[];
}

/**
 * テンプレート画像の一覧。正本は biz.template_images で、RPC template_images_master から読む。
 * RPC が失敗したら旧表を読む（点検案内が作れなくなるより、少し古い情報で動き続けるほうがまし）。
 */
// v1: js/supabase/master-data.js getMasterTemplateImages
export async function fetchTemplateImages(): Promise<DbTemplateImage[]> {
  try {
    const { data, error } = await supabase.rpc(RPC.templateImagesMaster);
    if (error) throw error;
    return (data ?? []) as DbTemplateImage[];
  } catch (e) {
    console.warn('[template-images] 業務システムからの取得に失敗しました。旧表で続行します:', e);
  }
  const { data, error } = await supabase
    .from(TABLES.templateImages)
    .select('*')
    .order('sort_order')
    .order('display_name');
  if (error) throw error;
  return (data ?? []) as DbTemplateImage[];
}

/** 移行前の equipment jsonb を点検情報の形にする（RPC 失敗時のフォールバック用） */
function legacyInspections(p: DbProperty): PropertyInspection[] {
  if (!Array.isArray(p.equipment)) return [];
  return p.equipment
    .filter((e) => !!e?.inspection_type_id)
    .map((e) => ({
      inspection_type_id: e.inspection_type_id as string,
      vendor_id: e.vendor_id ?? null,
      inspection_months: Array.isArray(e.inspection_months) ? e.inspection_months : [],
      remarks: e.remarks || '',
      remarks2: e.remarks2 || '',
    }));
}

/** 物件の行を画面で使う形にする（端末キーの正規化。点検情報はいったん移行前の jsonb） */
// v1: js/supabase/master-data.js getAllMasterData の propertiesMap 組み立て
export function toMasterProperties(rows: DbProperty[]): MasterProperty[] {
  const byCode = new Map<string, MasterProperty>();
  rows.forEach((p) => {
    if (byCode.has(p.property_code)) return;
    byCode.set(p.property_code, {
      id: p.id,
      property_code: p.property_code,
      property_name: p.property_name,
      terminals: Array.isArray(p.terminals) ? p.terminals.map(toTerminal) : [],
      inspections: legacyInspections(p),
    });
  });
  return Array.from(byCode.values());
}

/**
 * 点検情報を業務システム（biz）側から取り直して被せる。正本は biz.property_inspections。
 * RPC が返さなかった物件は「点検なし」。**RPC が失敗したら移行前の jsonb のまま残す。**
 */
// v1: js/supabase/master-data.js overlayInspections
export async function overlayInspections(properties: MasterProperty[]): Promise<MasterProperty[]> {
  try {
    const { data, error } = await supabase.rpc(RPC.inspectionsAll);
    if (error) throw error;
    const byCode = new Map<string, PropertyInspection[]>();
    ((data ?? []) as RpcInspectionRow[]).forEach((r) => {
      const list = byCode.get(r.property_code) ?? [];
      list.push({
        inspection_type_id: r.inspection_type_id,
        vendor_id: r.vendor_id,
        inspection_months: Array.isArray(r.inspection_months) ? r.inspection_months : [],
        remarks: r.remarks || '',
        remarks2: r.remarks2 || '',
      });
      byCode.set(r.property_code, list);
    });
    return properties.map((p) => ({ ...p, inspections: byCode.get(p.property_code) ?? [] }));
  } catch (e) {
    console.error('[inspections] 業務システムからの取得に失敗しました。移行前の情報で続行します:', e);
    return properties;
  }
}

/**
 * RPC の結果を全部読む。PostgREST は1回の応答の行数に上限がある（Supabase の既定は 1000 行）ので、
 * 全体の件数（count: 'exact'）に届くまで続きを取りにいく。
 */
// v1: js/supabase/master-data.js rpcAllRows
export async function rpcAllRows<T>(fn: string): Promise<T[]> {
  const rows: T[] = [];
  for (;;) {
    const { data, error, count } = await supabase
      .rpc(fn, {}, { count: 'exact' })
      .range(rows.length, rows.length + 999);
    if (error) throw error;
    const page = (data ?? []) as T[];
    rows.push(...page);
    if (page.length === 0 || count === null || rows.length >= count) return rows;
  }
}

/**
 * 台と台ごとの保守を業務システム（biz）から読み、物件コードごとに束ねる。読めるのは管理者だけ。
 * RPC は 台×点検種別 で1行を返し、保守がまだ無い台も inspection_id 以降が null の1行で返る。
 * RPC が無い・失敗したときは「台の保守なし」で続行する。
 */
// v1: js/supabase/master-data.js overlayUnitInspections
export async function fetchUnitInspections(): Promise<{
  unitsByProperty: Map<string, PropertyUnit[]>;
  typeOptions: UnitInspectionTypeOption[];
}> {
  try {
    const [rows, typeOptions] = await Promise.all([
      rpcAllRows<RpcUnitInspectionRow>(RPC.unitInspectionsAll),
      rpcAllRows<UnitInspectionTypeOption>(RPC.unitInspectionTypeOptions),
    ]);
    const unitsByProperty = new Map<string, PropertyUnit[]>();
    const unitsById = new Map<string, PropertyUnit>();
    rows.forEach((r) => {
      let unit = unitsById.get(r.unit_id);
      if (!unit) {
        unit = {
          unit_id: r.unit_id,
          category_code: r.category_code,
          category_label: r.category_label || r.category_code,
          unit_code: r.unit_code || '',
          unit_location: r.unit_location || '',
          unit_remarks: r.unit_remarks || '',
          unit_remarks2: r.unit_remarks2 || '',
          inspections: [],
        };
        unitsById.set(r.unit_id, unit);
        const list = unitsByProperty.get(r.property_code) ?? [];
        list.push(unit);
        unitsByProperty.set(r.property_code, list);
      }
      if (!r.inspection_id || !r.inspection_type_id) return;
      unit.inspections.push({
        inspection_id: r.inspection_id,
        inspection_type_id: r.inspection_type_id,
        inspection_type_label: r.inspection_type_label || '',
        vendor_id: r.vendor_id || null,
        vendor_name: r.vendor_name || '',
        inspection_months: Array.isArray(r.inspection_months) ? r.inspection_months : [],
        inspected_on: r.inspected_on || null,
        legacy_remarks: r.legacy_remarks || '',
        legacy_remarks2: r.legacy_remarks2 || '',
      });
    });
    return { unitsByProperty, typeOptions };
  } catch (e) {
    console.warn('[unit-inspections] 台ごとの保守を取得できませんでした。台の保守なしで続行します:', e);
    return { unitsByProperty: new Map(), typeOptions: [] };
  }
}

/**
 * マスターデータ一括取得。一般ユーザーは担当物件（signage_building_vendors の active）だけ。
 * 台ごとの保守はここでは読まない（必要な画面が fetchUnitInspections を呼ぶ）。
 */
// v1: js/supabase/master-data.js getAllMasterData
export async function fetchAllMasterData(
  profile: Pick<DbProfile, 'role' | 'vendor_id'> | null,
): Promise<MasterData> {
  const propertiesRaw =
    profile?.role === 'admin' ? await fetchMasterProperties() : await getAssignedBuildings(profile);

  const [vendors, inspectionTypes, categories, templateImages] = await Promise.all([
    fetchMasterVendors(),
    fetchMasterInspectionTypes(),
    fetchMasterCategories(),
    fetchTemplateImages().catch(() => [] as DbTemplateImage[]),
  ]);

  const properties = await overlayInspections(toMasterProperties(propertiesRaw));
  return { properties, vendors, inspectionTypes, categories, templateImages };
}
