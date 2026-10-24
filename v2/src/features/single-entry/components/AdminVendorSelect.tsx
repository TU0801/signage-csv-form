import type { ReactNode } from 'react';
import { Combobox } from '@/components/ui/Combobox';
import { vendorOptions } from '@/lib/vendorOptions';
import type { DbVendor } from '@/types/database';

interface AdminVendorSelectProps {
  vendors: DbVendor[];
  value: string;
  onChange: (vendorId: string) => void;
  /** 保守会社の右に並べる管理者用の部品（管理会社フィルター） */
  children?: ReactNode;
}

/**
 * 管理者が「どの保守会社として入力するか」を選ぶ。v1 と同じくヘッダーに出す（780f151。SingleEntryPage が HeaderSlot で差し込む）。
 * バッジは『保守会社』（修正依頼1024 B1。旧『管理者』）。保守会社のアカウントには出さない。
 */
// v1: index.html #adminVendorSelectGroup
export function AdminVendorSelect({ vendors, value, onChange, children }: AdminVendorSelectProps) {
  return (
    <div className="inline-flex items-center gap-2 rounded-md border-2 border-amber-400 bg-amber-50 px-2 py-1">
      <span className="rounded bg-amber-400 px-1.5 py-0.5 text-xs font-bold text-gray-900 whitespace-nowrap">
        保守会社
      </span>
      {/* 40社あり、社名の先頭が「㈱」「株式会社」だとプルダウンの頭出しが効かないので、検索付きにする */}
      <div className="w-[12rem] 2xl:w-[20rem]">
        <Combobox
          aria-label="保守会社"
          value={value}
          onChange={onChange}
          options={
            // 未選択のときは placeholder を見せる。選んだ後だけ先頭に空へ戻す候補を出す
            value ? [{ value: '', label: '保守会社を選択' }, ...vendorOptions(vendors)] : vendorOptions(vendors)
          }
          placeholder="保守会社を選択（社名の一部で検索）"
          className="border-amber-400 py-1"
        />
      </div>
      {children}
    </div>
  );
}
