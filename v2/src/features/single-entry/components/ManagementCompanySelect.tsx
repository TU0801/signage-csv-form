import { MANAGEMENT_COMPANY_NONE } from '../lib/entryLogic';

interface ManagementCompanySelectProps {
  companies: { id: string; name: string }[];
  value: string;
  onChange: (companyId: string) => void;
}

/** 管理者が物件の選択肢を管理会社で絞る（既定は全て）。ヘッダーの管理者の枠に保守会社と並べて出す */
export function ManagementCompanySelect({ companies, value, onChange }: ManagementCompanySelectProps) {
  return (
    <select
      aria-label="管理会社"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="max-w-[11rem] 2xl:max-w-[16rem] rounded border border-amber-400 bg-white px-2 py-1 text-sm text-gray-900"
    >
      <option value="">管理会社: 全て</option>
      {companies.map((c) => (
        <option key={c.id} value={c.id}>
          {c.name}
        </option>
      ))}
      <option value={MANAGEMENT_COMPANY_NONE}>管理会社: 未設定</option>
    </select>
  );
}
