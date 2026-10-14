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

/**
 * テンプレート画像の一覧。**正本は業務システムの biz.template_images**（2026-09-29 切り替え）。
 * 窓口の RPC signage.template_images_master() から読む。画像ファイルは poster-images/templates/ のまま。
 *
 * **RPC が失敗したら旧表 signage_master_template_images を読む。** 点検案内が作れなくなるより、
 * 少し古い情報で動き続けるほうがまし（点検の切り替えと同じ方針）。RPC の migration を当てる前は
 * こちらが通常の経路になるので、console.error ではなく console.warn で出す。
 */
export async function getMasterTemplateImages() {
  try {
    const { data, error } = await supabase.rpc('template_images_master');
    if (error) throw error;
    return data || [];
  } catch (e) {
    console.warn('[template-images] 業務システムからの取得に失敗しました。旧表で続行します:', e);
  }
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

  // 台ごとの保守（業務システムで台を登録した大分類）。読めるのは管理者だけなので、管理者のときだけ引く
  const unitInspectionTypes = profile && profile.role === 'admin'
    ? await overlayUnitInspections(propertiesMap)
    : [];

  const properties = Array.from(propertiesMap.values());
  return { properties, vendors, inspectionTypes, categories, templateImages, unitInspectionTypes };
}

/**
 * @param {Object} [options]
 * @param {boolean} [options.includeNoTerminal=false] 端末（サイネージ）未設置の物件も terminalId='' の1行として含める。
 *   入力フォーム（index.html）は未設置物件も選べる必要があるため true で呼ぶ（0926 依頼）
 */
export async function getAllMasterDataCamelCase({ includeNoTerminal = false } = {}) {
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
      if (includeNoTerminal) {
        properties.push({
          propertyCode: p.property_code,
          propertyName: p.property_name,
          terminalId: '',
          supplement: '',
          address: p.address || ''
        });
      }
      return;
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

// RPC の結果を全部読む。**PostgREST は1回の応答の行数に上限がある**（Supabase の既定は 1000 行）ので、
// 全体の件数（count: 'exact'）に届くまで続きを取りにいく。打ち切られた一覧で物件モーダルを開くと、
// 台がある大分類の点検が従来の表に出てしまう
async function rpcAllRows(fn) {
  const rows = [];
  for (;;) {
    const { data, error, count } = await supabase.rpc(fn, {}, { count: 'exact' }).range(rows.length, rows.length + 999);
    if (error) throw error;
    rows.push(...(data || []));
    if (!data || data.length === 0 || count === null || rows.length >= count) return rows;
  }
}

/**
 * 台と台ごとの保守を業務システム（biz）から読み、物件ごとに prop.units へ詰める（2026-10-14）。
 *
 * **業務システムで台を登録した大分類は、保守（点検種別・保守会社・点検月・検査月）を台ごとに持つ。**
 * 物件×点検種別の一覧（overlayInspections の prop.equipment）にはその集計が1行で返るが、
 * そちらからは書けない。物件モーダルは prop.units を「台ごとの保守」の表で編集する。
 *
 * - prop.units: [{ unit_id, category_code, category_label, unit_code, unit_location, unit_remarks, unit_remarks2,
 *     inspections: [{ inspection_id, inspection_type_id, inspection_type_label, vendor_id, vendor_name,
 *       inspection_months, inspected_on, legacy_remarks, legacy_remarks2 }] }]
 *   RPC は 台×点検種別 で1行を返す。**保守がまだ無い台も1行で返り、inspection_id から後ろが全部 null**
 *   なので、unit_id で束ねて inspections を空にする。
 * - 戻り値: 台に付けられる点検種別の選択肢 [{ category_code, inspection_type_id, inspection_type_label, sort }]
 *
 * **RPC が無い DB（PGRST202。業務システム側の migration がまだ）や失敗は「台の保守なし」で続行する。**
 * 物件モーダルは従来の表だけで今までどおり使える。
 */
export async function overlayUnitInspections(propertiesMap) {
  propertiesMap.forEach(prop => { prop.units = []; });
  try {
    const [rows, typeOptions] = await Promise.all([
      rpcAllRows('unit_inspections_all'),
      rpcAllRows('unit_inspection_type_options'),
    ]);
    const unitsById = new Map();
    rows.forEach(r => {
      const prop = propertiesMap.get(r.property_code);
      if (!prop) return;
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
          inspections: []
        };
        unitsById.set(r.unit_id, unit);
        prop.units.push(unit);
      }
      if (!r.inspection_id) return;
      unit.inspections.push({
        inspection_id: r.inspection_id,
        inspection_type_id: r.inspection_type_id,
        inspection_type_label: r.inspection_type_label || '',
        vendor_id: r.vendor_id || null,
        vendor_name: r.vendor_name || '',
        inspection_months: Array.isArray(r.inspection_months) ? r.inspection_months : [],
        inspected_on: r.inspected_on || null,
        legacy_remarks: r.legacy_remarks || '',
        legacy_remarks2: r.legacy_remarks2 || ''
      });
    });
    return typeOptions;
  } catch (e) {
    propertiesMap.forEach(prop => { prop.units = []; });
    console.warn('[unit-inspections] 台ごとの保守を取得できませんでした。台の保守なしで続行します:', e);
    return [];
  }
}
