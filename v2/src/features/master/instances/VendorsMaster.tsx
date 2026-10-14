import { TABLES } from '@/lib/supabase';
import type { DbVendor } from '@/types/database';
import type { MasterConfig } from '../types/masterConfig';
import { MasterListPage } from '../components/MasterListPage';

type VendorRecord = DbVendor & Record<string, unknown>;

// 保守会社は読み取り専用（v1.34.0〜）。正本は業務システムの取引先で、block_vendor_direct_write が直接の書き込みを拒否する
const config: MasterConfig<VendorRecord> = {
  tableName: TABLES.vendors,
  displayName: '保守会社',
  searchField: 'vendor_name',
  uniqueField: 'vendor_name',
  defaultSort: 'vendor_name',
  columns: [
    { key: 'vendor_name', label: '保守会社名' },
    { key: 'emergency_contact', label: '緊急連絡先' },
    { key: 'inspection_type', label: '点検種別' },
  ],
  formFields: [
    { name: 'vendor_name', label: '保守会社名', type: 'text', required: true },
    { name: 'emergency_contact', label: '緊急連絡先', type: 'text', placeholder: '電話番号' },
  ],
  defaultValues: {
    vendor_name: '',
    emergency_contact: '',
  } as Partial<VendorRecord>,
  readOnly: true,
  readOnlyNote: '保守会社は業務システムの取引先で編集します（「保守会社」を付けると表示されます）',
};

export function VendorsMaster() {
  return <MasterListPage config={config} />;
}
