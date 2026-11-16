/*
 * 管理会社ごとの保守会社の既定の上書き（修正依頼1115 (5)。表 signage_mgmt_vendor_overrides）。
 * 上書きは「管理会社 × 保守会社 × 点検種別」で、種別 NULL の行は緊急連絡先、種別ありの行は点検 TPL（テンプレートNo）。
 * 申請の初期値（1件入力・一括入力・点検一覧の申請）は、物件の管理会社の上書きがあればそれ、無ければ既定（点検種別の TPL・保守会社マスターの
 * 緊急連絡先）。DB の TPL 照合（guard_entry_type_scope・portal_update_submitted_entry）も同じ組み合わせの上書きだけを許すので、
 * 保守会社は申請の受注先として DB が記録する会社（管理会社の申請は点検行・台の保守会社）で引く。
 */

/** 物件コードの書式の揺れ（120410 と 120410-00）を吸収する（DB の regexp_replace(…, '-00$', '') と同じ規則） */
function normalizePropertyCode(code: string): string {
  return code.trim().replace(/-00$/, '');
}

/** 上書きの1行（RPC entry_vendor_defaults の overrides の要素） */
export interface VendorOverrideRow {
  management_company_id: string;
  vendor_id: string;
  inspection_type_id: string | null;
  emergency_contact: string | null;
  template_no: string | null;
}

/** RPC entry_vendor_defaults の戻り値（properties: 物件コード → 管理会社 id。上書きのある管理会社の物件だけ） */
export interface EntryVendorDefaultsPayload {
  properties: Record<string, string | null>;
  overrides: VendorOverrideRow[];
}

/** 引きやすい形にしたもの */
export interface VendorDefaultsIndex {
  /** 正規化した物件コード（-00 を外す）→ 管理会社 id */
  companyByCode: Map<string, string>;
  /** "管理会社|保守会社|点検種別（連絡先は空）" → 上書き */
  byKey: Map<string, VendorOverrideRow>;
}

const key = (mc: string, vendorId: string, typeId: string | null) => `${mc}|${vendorId}|${typeId ?? ''}`;

export function buildVendorDefaultsIndex(payload: EntryVendorDefaultsPayload | null | undefined): VendorDefaultsIndex {
  const companyByCode = new Map<string, string>();
  Object.entries(payload?.properties ?? {}).forEach(([code, mc]) => {
    if (mc) companyByCode.set(normalizePropertyCode(code), mc);
  });
  const byKey = new Map<string, VendorOverrideRow>();
  (payload?.overrides ?? []).forEach((o) => byKey.set(key(o.management_company_id, o.vendor_id, o.inspection_type_id), o));
  return { companyByCode, byKey };
}

export interface EntryDefaultsTarget {
  propertyCode: string | number | null | undefined;
  /** 申請の受注先として記録する保守会社 */
  vendorId: string | null | undefined;
  /** 点検種別（signage_master_inspection_types.id ＝ biz.inspection_types.id） */
  inspectionTypeId: string | null | undefined;
}

export interface EntryDefaults {
  templateNo: string;
  emergencyContact: string;
  /** 管理会社の上書きを使ったか */
  templateOverridden: boolean;
  contactOverridden: boolean;
}

/**
 * 申請の初期値（TPL・緊急連絡先）。base は既定（点検種別の TPL・保守会社マスターの緊急連絡先）。
 * 物件の管理会社 × 保守会社 × 点検種別の TPL の上書き、物件の管理会社 × 保守会社の緊急連絡先の上書きがあればそれにする
 */
export function resolveEntryDefaults(
  index: VendorDefaultsIndex | null | undefined,
  target: EntryDefaultsTarget,
  base: { templateNo: string; emergencyContact: string },
): EntryDefaults {
  const plain = { ...base, templateOverridden: false, contactOverridden: false };
  if (!index || !target.vendorId || target.propertyCode == null || target.propertyCode === '') return plain;
  const mc = index.companyByCode.get(normalizePropertyCode(String(target.propertyCode)));
  if (!mc) return plain;
  const tpl = target.inspectionTypeId ? index.byKey.get(key(mc, target.vendorId, target.inspectionTypeId))?.template_no : null;
  const contact = index.byKey.get(key(mc, target.vendorId, null))?.emergency_contact;
  return {
    templateNo: tpl || base.templateNo,
    emergencyContact: contact || base.emergencyContact,
    templateOverridden: !!tpl,
    contactOverridden: !!contact,
  };
}

/** 管理会社の保守会社タブの1行（RPC mgmt_vendor_defaults） */
export interface MgmtVendorDefaultRow {
  vendor_id: string;
  vendor_name: string;
  default_emergency_contact: string | null;
  inspection_type_id: string | null;
  inspection_type_label: string | null;
  default_template_no: string | null;
  contact_override_id: string | null;
  emergency_contact: string | null;
  template_override_id: string | null;
  template_no: string | null;
  updated_at: string | null;
}

/** 表に出す値（上書きがあれば上書き、無ければ既定）と、個別設定の有無 */
export function effectiveVendorDefaults(row: MgmtVendorDefaultRow): {
  emergencyContact: string;
  templateNo: string;
  contactOverridden: boolean;
  templateOverridden: boolean;
} {
  const contactOverridden = !!row.contact_override_id && !!row.emergency_contact;
  const templateOverridden = !!row.template_override_id && !!row.template_no;
  return {
    emergencyContact: (contactOverridden ? row.emergency_contact : row.default_emergency_contact) ?? '',
    templateNo: (templateOverridden ? row.template_no : row.default_template_no) ?? '',
    contactOverridden,
    templateOverridden,
  };
}

/**
 * 編集モーダルの保存で、上書きの行をどうするか。空か既定と同じなら上書きを持たない（既定に追従させる）。
 * 'set' は値を登録・更新、'clear' は行を消す（既定に戻す）、'keep' は何もしない
 */
export function overrideAction(
  input: string,
  defaultValue: string | null,
  currentOverride: string | null,
): { kind: 'set'; value: string } | { kind: 'clear' } | { kind: 'keep' } {
  const v = input.trim();
  const wantsDefault = v === '' || v === (defaultValue ?? '').trim();
  if (wantsDefault) return currentOverride ? { kind: 'clear' } : { kind: 'keep' };
  if (v === (currentOverride ?? '').trim()) return { kind: 'keep' };
  return { kind: 'set', value: v };
}
