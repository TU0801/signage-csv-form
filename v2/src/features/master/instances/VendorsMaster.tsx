import { fetchMasterVendors } from '@/lib/api/masterData';
import { useAuthStore } from '@/stores/authStore';
import type { DbVendor } from '@/types/database';
import type { MasterConfig } from '../types/masterConfig';
import { MasterListPage } from '../components/MasterListPage';
import { VendorDefaultsTable } from '../components/VendorDefaultsTable';

type VendorRecord = DbVendor & Record<string, unknown>;

// 保守会社は読み取り専用（v1.34.0〜）。正本は業務システムの取引先で、block_vendor_direct_write が直接の書き込みを拒否する
// v1: js/admin-masters.js renderVendors / admin.html #master-vendors
const config: MasterConfig<VendorRecord> = {
  api: {
    list: async () => (await fetchMasterVendors()) as VendorRecord[],
  },
  displayName: '保守会社',
  searchFields: ['vendor_name'],
  searchPlaceholder: '保守会社名で検索...',
  labelField: 'vendor_name',
  columns: [
    { key: 'vendor_name', label: '保守会社名' },
    { key: 'emergency_contact', label: '緊急連絡先' },
    { key: 'inspection_type', label: '点検種別' },
  ],
  formFields: [],
  defaultValues: {},
  readOnly: true,
  note: (
    <>
      保守会社は業務システムの取引先で編集します（
      <a
        href="https://system.1984.jp/companies?kind=maintenance"
        target="_blank"
        rel="noopener noreferrer"
        className="text-blue-600 underline"
      >
        取引先一覧を開く
      </a>
      ）。業務システムの取引先で「保守会社」を付けると表示されます。管理会社は自社用の緊急連絡先・点検TPLを、管理会社のアカウントのこのタブで個別に設定できます
    </>
  ),
};

export function VendorsMaster() {
  // 管理会社は「保守会社 × 点検種別」の既定と自社の個別設定（緊急連絡先・点検TPL）の表（修正依頼1115 (5)）。管理者は今の一覧のまま
  const isManagement = useAuthStore((s) => s.profile?.role === 'management');
  if (isManagement) return <VendorDefaultsTable />;
  return (
    <MasterListPage
      config={config}
      renderCell={(key, value) => {
        if (key === 'emergency_contact') return value ? String(value) : '連絡先未設定';
        if (key === 'inspection_type') return value ? String(value) : '-';
        return undefined;
      }}
    />
  );
}
