// supabase/master-data.js - マスターデータ取得

import { supabase } from './client.js';
import { getProfile } from './auth.js';

export async function getMasterProperties() {
  const { data, error } = await supabase
    .from('signage_master_properties')
    .select('*')
    .order('property_code');
  if (error) throw error;
  return data;
}

export async function getMasterVendors() {
  const { data, error } = await supabase
    .from('signage_master_vendors')
    .select('*')
    .order('vendor_name');
  if (error) throw error;
  return data;
}

export async function getMasterInspectionTypes() {
  const { data, error } = await supabase
    .from('signage_master_inspection_types')
    .select('*')
    .order('sort_order')
    .order('template_no');
  if (error) throw error;
  return data;
}

export async function getMasterCategories() {
  const { data, error } = await supabase
    .from('signage_master_categories')
    .select('*')
    .order('sort_order');
  if (error) throw error;
  return data;
}

export async function getMasterTemplateImages() {
  const { data, error } = await supabase
    .from('signage_master_template_images')
    .select('*')
    .order('sort_order')
    .order('display_name');
  if (error) throw error;
  return data;
}

export async function getAllMasterData() {
  const profile = await getProfile();
  let propertiesRaw;
  if (profile && profile.role === 'admin') {
    propertiesRaw = await getMasterProperties();
  } else {
    // getAssignedBuildings は relationships.js で定義されるが、循環依存を避けるため動的import
    const { getAssignedBuildings } = await import('./relationships.js');
    propertiesRaw = await getAssignedBuildings();
  }

  const [vendors, inspectionTypes, categories, templateImages] = await Promise.all([
    getMasterVendors(),
    getMasterInspectionTypes(),
    getMasterCategories(),
    getMasterTemplateImages().catch(() => []),
  ]);

  const propertiesMap = new Map();
  propertiesRaw.forEach(p => {
    const code = p.property_code;
    if (!propertiesMap.has(code)) {
      propertiesMap.set(code, {
        id: p.id,
        property_code: code,
        property_name: p.property_name,
        terminals: [],
        // **点検情報の正本は業務システム（biz）側。** ここで読む jsonb は移行前の名残で、
        // 下の overlayInspections() が RPC の結果で上書きする（2026-09-19 切り替え）
        equipment: Array.isArray(p.equipment) ? p.equipment : []
      });
    }
    if (Array.isArray(p.terminals)) {
      p.terminals.forEach(t => {
        propertiesMap.get(code).terminals.push({
          terminal_id: t.terminalId || t.terminal_id || '',
          supplement: t.supplement || ''
        });
      });
    } else if (p.terminal_id) {
      propertiesMap.get(code).terminals.push({
        terminal_id: p.terminal_id,
        supplement: p.supplement || ''
      });
    }
  });

  // 点検情報を業務システム（biz）から取り直す。正本はあちら（2026-09-19 切り替え）
  await overlayInspections(propertiesMap);

  const properties = Array.from(propertiesMap.values());
  return { properties, vendors, inspectionTypes, categories, templateImages };
}

export async function getAllMasterDataCamelCase() {
  const profile = await getProfile();
  let propertiesRaw;
  if (profile && profile.role === 'admin') {
    propertiesRaw = await getMasterProperties();
  } else {
    const { getAssignedBuildings } = await import('./relationships.js');
    propertiesRaw = await getAssignedBuildings();
  }

  const [vendors, inspectionTypes, categories, templateImages] = await Promise.all([
    getMasterVendors(),
    getMasterInspectionTypes(),
    getMasterCategories(),
    getMasterTemplateImages().catch(() => []),
  ]);

  const properties = [];
  console.log('🔍 propertiesRaw:', propertiesRaw?.slice(0, 2));
  propertiesRaw.forEach(p => {
    const terminals = Array.isArray(p.terminals) ? p.terminals : [];
    if (terminals.length === 0) {
      console.warn('⚠️ No terminals for property:', p.property_code);
    }
    terminals.forEach(t => {
      properties.push({
        propertyCode: p.property_code,
        propertyName: p.property_name,
        terminalId: t.terminalId || t.terminal_id || '',
        supplement: t.supplement || '',
        address: p.address || ''
      });
    });
  });
  console.log('🔍 properties (camelCase):', properties?.slice(0, 2));

  const vendorsFormatted = vendors.map(v => ({
    id: v.id,
    vendorName: v.vendor_name,
    emergencyContact: v.emergency_contact || '',
    category: v.category || '',
    inspectionType: v.inspection_type || ''
  }));

  const categoriesFormatted = (categories || []).map(c => c.category_name || c);

  const notices = inspectionTypes.map((it, index) => ({
    id: index + 1,
    inspectionId: it.id,              // 実DBのUUID（ベンダー×点検種別 紐付け照合に使用）
    inspectionType: it.inspection_name,
    category: it.category || '',      // 実カテゴリ（テキスト列）。点検種別の絞り込みに使用
    categoryId: it.category_id || 0,
    showOnBoard: it.show_on_board !== false,
    templateNo: it.template_no || '',
    noticeText: it.default_text || '',
    frameNo: 2,
    image: '',
    daysBeforeStart: 30
  }));

  return {
    properties,
    vendors: vendorsFormatted,
    categories: categoriesFormatted,
    notices,
    templateImages: templateImages || []
  };
}

/**
 * 点検情報を業務システム（biz）側から取り直して被せる（2026-09-19 の統合切り替え）。
 *
 * **正本は biz.property_inspections。** signage_master_properties.equipment は
 * 移行前の名残で、以後は読まない（書き込みも RPC 経由になる）。
 *
 * **RPC が失敗したら jsonb のまま残す。** 点検案内が作れなくなるより、
 * 少し古い情報で動き続けるほうがまし。失敗はコンソールに出す。
 */
export async function overlayInspections(propertiesMap) {
  try {
    const { data, error } = await supabase.rpc('inspections_all');
    if (error) throw error;
    // RPC が返した物件だけ差し替える。返らなかった物件は「点検なし」が正しい
    const byCode = new Map();
    (data || []).forEach(r => {
      const list = byCode.get(r.property_code) || [];
      list.push({
        inspection_type_id: r.inspection_type_id,
        vendor_id: r.vendor_id,
        inspection_months: Array.isArray(r.inspection_months) ? r.inspection_months : [],
        remarks: r.remarks || '',
        remarks2: r.remarks2 || ''
      });
      byCode.set(r.property_code, list);
    });
    propertiesMap.forEach((prop, code) => {
      prop.equipment = byCode.get(code) || [];
    });
  } catch (e) {
    console.error('[inspections] 業務システムからの取得に失敗しました。移行前の情報で続行します:', e);
  }
  return propertiesMap;
}
