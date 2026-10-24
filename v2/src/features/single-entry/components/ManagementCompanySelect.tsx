import { MANAGEMENT_COMPANY_NONE } from '../lib/entryLogic';

interface ManagementCompanySelectProps {
  companies: { id: string; name: string }[];
  value: string;
  onChange: (companyId: string) => void;
}

/** 物件の選択肢と行を管理会社で絞る（既定は全て） */
export function ManagementCompanySelect({ companies, value, onChange }: ManagementCompanySelectProps) {
  return (
    <select
      aria-label="管理会社"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="max-w-[11rem] 2xl:max-w-[16rem] rounded border border-sky-400 bg-white px-2 py-1 text-sm text-gray-900"
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

/**
 * ヘッダーの『管理会社』フィルター（バッジ＋セレクト。修正依頼1024 B2）。管理者と保守会社のアカウントに出す。
 * 保守会社セレクト（管理者だけ）とは別の枠にする（注記の図のとおり）
 */
export function ManagementCompanyFilter(props: ManagementCompanySelectProps) {
  return (
    <div className="inline-flex items-center gap-2 rounded-md border-2 border-sky-300 bg-sky-50 px-2 py-1">
      <span className="whitespace-nowrap rounded bg-sky-500 px-1.5 py-0.5 text-xs font-bold text-white">管理会社</span>
      <ManagementCompanySelect {...props} />
    </div>
  );
}
