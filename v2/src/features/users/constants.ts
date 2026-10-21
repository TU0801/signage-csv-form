import type { DbProfile } from '@/types/database';

/** パスワードの最小文字数（Edge Function signage-admin-users の MIN_PASSWORD_LENGTH と同じ） */
export const MIN_PASSWORD_LENGTH = 6;

/**
 * 権限の選択肢。v1 と同じ並び（ユーザー → 管理者）で、既定はユーザー（v1: admin.html #newUserRole）。
 * 管理会社は点検ポータル（2026-10-21）で追加。v1 には無いので末尾に置く
 */
export const ROLE_OPTIONS = [
  { value: 'user', label: 'ユーザー' },
  { value: 'admin', label: '管理者' },
  { value: 'management', label: '管理会社' },
];

/** 一覧のバッジに出す権限名 */
export function roleLabel(role: DbProfile['role']): string {
  return ROLE_OPTIONS.find((o) => o.value === role)?.label ?? role;
}

/**
 * 権限ごとに必須の会社が選ばれているか。足りなければ断り文言を返す（画面の確認と useUsers の最後の砦で共用）。
 * 保守会社（user）は保守会社、管理会社（management）は管理会社が必須。管理者は保守会社なしで運用している
 */
export function companyRequiredError(
  role: DbProfile['role'],
  vendorId: string | null,
  managementCompanyId: string | null,
): string | null {
  if (role === 'user' && !vendorId) return '保守会社を選択してください';
  if (role === 'management' && !managementCompanyId) return '管理会社を選択してください';
  return null;
}

/**
 * 保存する会社の列をそろえる。管理会社は保守会社を持たない（申請の作成が開かないように）、
 * 管理会社以外は管理会社を持たない（範囲の判定が role と食い違わないように）
 */
export function companyColumns(
  role: DbProfile['role'],
  vendorId: string | null,
  managementCompanyId: string | null,
): { vendor_id: string | null; management_company_id: string | null } {
  return role === 'management'
    ? { vendor_id: null, management_company_id: managementCompanyId || null }
    : { vendor_id: vendorId || null, management_company_id: null };
}
