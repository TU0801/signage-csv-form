import { resolveEntryDefaults, type EntryDefaults } from '@/lib/vendorDefaults';
import type { BulkEntryRow, BulkMasterData, BulkVendorSelection } from '../types';

/**
 * 一括入力の行の TPL・緊急連絡先の既定（修正依頼1115 (5)）。点検種別の TPL・保守会社マスターの緊急連絡先を土台に、
 * 物件の管理会社の個別設定（masterData.vendorDefaults。entry_vendor_defaults）を当てる。
 * vendor は申請の受注先として記録する保守会社（管理会社は行ごとの保守会社、管理者・保守会社は画面上部の保守会社）。
 * 申請（buildBulkEntries）・CSV（generateBulkCsv）・詳細設定（RowDetailModal）が同じ値を使う
 */
export function rowEntryDefaults(
  row: Pick<BulkEntryRow, 'propertyCode' | 'inspectionType'>,
  masterData: BulkMasterData,
  vendorSel: BulkVendorSelection,
): EntryDefaults {
  const notice = row.inspectionType ? masterData.notices.find((n) => n.inspectionType === row.inspectionType) : undefined;
  const vendor = masterData.vendors.find((v) => v.vendorName === vendorSel.name);
  return resolveEntryDefaults(
    masterData.vendorDefaults,
    { propertyCode: row.propertyCode, vendorId: vendorSel.id ?? vendor?.id ?? null, inspectionTypeId: notice?.id ?? null },
    { templateNo: notice?.templateNo || '', emergencyContact: vendor?.emergencyContact || '' },
  );
}
