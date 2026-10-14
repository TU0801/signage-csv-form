import type { DbVendor } from '@/types/database';

interface AdminVendorSelectProps {
  vendors: DbVendor[];
  value: string;
  onChange: (vendorId: string) => void;
}

/**
 * 管理者が「どの保守会社として入力するか」を選ぶ。v1 と同じくヘッダーに出す（780f151。SingleEntryPage が HeaderSlot で差し込む）。
 */
// v1: index.html #adminVendorSelectGroup
export function AdminVendorSelect({ vendors, value, onChange }: AdminVendorSelectProps) {
  return (
    <div className="inline-flex items-center gap-2 rounded-md border-2 border-amber-400 bg-amber-50 px-2 py-1">
      <span className="rounded bg-amber-400 px-1.5 py-0.5 text-xs font-bold text-gray-900 whitespace-nowrap">
        管理者
      </span>
      <select
        aria-label="保守会社"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="max-w-[220px] rounded border border-amber-400 bg-white px-2 py-1 text-sm text-gray-900"
      >
        <option value="">-- 保守会社を選択 --</option>
        {vendors.map((v) => (
          <option key={v.id} value={v.id}>
            {v.vendor_name}
          </option>
        ))}
      </select>
    </div>
  );
}
