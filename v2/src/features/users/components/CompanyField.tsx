import { Combobox } from '@/components/ui/Combobox';
import { vendorOptions } from '@/lib/vendorOptions';
import type { DbProfile, DbVendor } from '@/types/database';
import type { ManagementCompanyRow } from '@/types/portal';

interface CompanyFieldProps {
  /** 欄の id の頭（newUser → newUserVendor / newUserManagementCompany。既存の id を変えないため） */
  idPrefix: string;
  role: DbProfile['role'];
  vendors: DbVendor[];
  managementCompanies: ManagementCompanyRow[];
  vendorId: string;
  managementCompanyId: string;
  onVendorChange: (value: string) => void;
  onManagementCompanyChange: (value: string) => void;
  error?: string;
}

/**
 * 権限に応じた会社の選択欄（追加・編集のモーダルで共用）。
 * 管理会社アカウントは保守会社を持たないので、保守会社の欄の代わりに管理会社の欄を出す。
 * 切り替えても反対側の選択は消さない（保存時に companyColumns で使わない方を null にする）
 */
export function CompanyField({
  idPrefix,
  role,
  vendors,
  managementCompanies,
  vendorId,
  managementCompanyId,
  onVendorChange,
  onManagementCompanyChange,
  error,
}: CompanyFieldProps) {
  if (role === 'management') {
    return (
      <div className="space-y-1">
        <Combobox
          label="管理会社"
          required
          id={`${idPrefix}ManagementCompany`}
          options={managementCompanies.map((c) => ({ value: c.id, label: c.name }))}
          placeholder="選択してください（社名の一部で検索）"
          value={managementCompanyId}
          onChange={onManagementCompanyChange}
          error={error}
        />
        <p className="text-xs text-gray-500">必須です。自社が管理する物件の点検だけを見られます</p>
      </div>
    );
  }
  return (
    <div className="space-y-1">
      <Combobox
        label="保守会社"
        required={role !== 'admin'}
        id={`${idPrefix}Vendor`}
        options={vendorOptions(vendors, { withNone: role === 'admin' })}
        placeholder="選択してください（社名の一部で検索）"
        value={vendorId}
        onChange={onVendorChange}
        error={error}
      />
      <p className="text-xs text-gray-500">一般ユーザーは必須です。管理者は未選択のままで構いません</p>
    </div>
  );
}
