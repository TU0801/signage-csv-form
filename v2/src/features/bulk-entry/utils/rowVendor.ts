import { matchInspectionLink } from '@/features/inspection-portal/lib/inspectionLink';
import type { ScheduleItem } from '@/features/inspection-portal/lib/schedule';
import { VENDOR_UNSET, vendorRowMatches } from '@/lib/vendorFilter';
import type { BulkInspectionLink } from './buildBulkEntries';
import type { BulkEntryRow, BulkVendor, BulkVendorSelection } from '../types';

/*
 * 行ごとの保守会社（修正依頼1115 (2)）。管理会社の一括入力は全社の点検を1つの表に出すので、申請の受注先
 * （vendor_id・CSV 4列目の受注先名）と緊急連絡先の既定を「画面上部の1社」ではなく行の点検から決める。
 * DB（guard_entry_portal_columns → entry_vendor_for_management）と同じ決め方: 台の行は台の保守会社（未設定なら点検行の保守会社）、
 * 予定の行は点検行の保守会社、手で足した行は matchInspectionLink で当たった点検行の保守会社。
 * 名前は保守会社マスター（signage_master_vendors）の名前（DB が受注先名をこの名前と照らすため）。
 * 管理者・保守会社のアカウントは今までどおり画面上部の保守会社（currentVendor）を使う。
 */

export const VENDOR_UNREGISTERED_MESSAGE =
  'この点検は保守会社が未登録です。業務システムで保守会社を登録してください';
export const VENDOR_NOT_IN_MASTER_MESSAGE =
  'この点検の保守会社がサイネージの保守会社マスターにありません（管理者にお問い合わせください）';
export const NO_INSPECTION_MESSAGE =
  '点検の予定に当たらないため受注先の保守会社が決まりません（物件・点検種別・点検開始日の月が点検の予定と合う行だけ申請できます）';
export const AMBIGUOUS_VENDOR_MESSAGE =
  '同じ物件・点検種別の点検が複数の保守会社にあり、受注先が決まりません。点検の予定の行から申請してください';

/** 行の保守会社。id・name が決まらないときは reason に理由（申請の前に止める） */
export interface RowVendor extends BulkVendorSelection {
  emergencyContact: string;
  /** 行の点検（手の行で当たった点検行・予定の行の点検行）。決まらなければ無し */
  inspectionId?: string | null;
  reason?: string;
}

export type RowVendorOf = (row: BulkEntryRow) => RowVendor;

/** 予定の行（台ごとの行は台）の保守会社の id。DB の entry_vendor_for_management と同じ */
export function scheduleItemVendorId(
  item: Pick<ScheduleItem, 'inspection' | 'unit'>,
): string | null {
  if (item.unit) return item.unit.maintainer_id ?? item.inspection.vendor_id ?? null;
  return item.inspection.vendor_id ?? null;
}

function fromVendorId(
  vendorId: string | null,
  vendors: readonly BulkVendor[],
  inspectionId: string | null,
): RowVendor {
  if (!vendorId)
    return {
      id: null,
      name: null,
      emergencyContact: '',
      inspectionId,
      reason: VENDOR_UNREGISTERED_MESSAGE,
    };
  const vendor = vendors.find((v) => v.id === vendorId);
  if (!vendor)
    return {
      id: vendorId,
      name: null,
      emergencyContact: '',
      inspectionId,
      reason: VENDOR_NOT_IN_MASTER_MESSAGE,
    };
  return {
    id: vendor.id,
    name: vendor.vendorName,
    emergencyContact: vendor.emergencyContact || '',
    inspectionId,
  };
}

/**
 * 行の保守会社を引く関数を作る（管理会社の一括入力用）。
 * itemOf は予定の行の点検（ScheduleItem）、links は手の行を結び付ける点検行（portal_inspections の範囲）
 */
export function makeRowVendorOf({
  vendors,
  itemOf,
  links,
}: {
  vendors: readonly BulkVendor[];
  itemOf: (row: BulkEntryRow) => Pick<ScheduleItem, 'inspection' | 'unit'> | undefined;
  links: readonly BulkInspectionLink[];
}): RowVendorOf {
  return (row) => {
    if (row.schedule) {
      const item = itemOf(row);
      if (!item)
        return {
          id: null,
          name: null,
          emergencyContact: '',
          inspectionId: row.schedule.inspectionId,
          reason: NO_INSPECTION_MESSAGE,
        };
      return fromVendorId(scheduleItemVendorId(item), vendors, item.inspection.inspection_id);
    }
    return matchedRowVendor(row, links, vendors);
  };
}

/**
 * 点検の予定の行でない入力（一括入力の手で足した行・1件入力）の保守会社。物件コード＋点検種別＋点検開始日の月で当たる
 * 点検行（matchInspectionLink）の保守会社。当たらない・複数の保守会社にまたがる・保守会社未登録なら reason に理由
 */
export function matchedRowVendor(
  row: { propertyCode: string | number; inspectionType: string; startDate: string },
  links: readonly BulkInspectionLink[],
  vendors: readonly BulkVendor[],
): RowVendor {
  const link = matchInspectionLink(row, [...links], null);
  if (!link)
    return {
      id: null,
      name: null,
      emergencyContact: '',
      inspectionId: null,
      reason: NO_INSPECTION_MESSAGE,
    };
  // 当たる点検行が複数の保守会社にまたがるときは、どれか1社を黙って選ばない
  const code = link.property_inspection_id;
  const hit = links.find((l) => l.inspection_id === code)!;
  const others = links.filter(
    (l) =>
      l.inspection_id !== code &&
      l.property_code === hit.property_code &&
      (l.inspection_type_label ?? '') === (hit.inspection_type_label ?? '') &&
      matchInspectionLink(row, [l], null) !== null,
  );
  if (others.some((l) => (l.vendor_id ?? null) !== (hit.vendor_id ?? null))) {
    return {
      id: null,
      name: null,
      emergencyContact: '',
      inspectionId: null,
      reason: AMBIGUOUS_VENDOR_MESSAGE,
    };
  }
  return fromVendorId(hit.vendor_id ?? null, vendors, hit.inspection_id);
}

/** 画面上部の保守会社をそのまま返す（管理者・保守会社。今までと同じ値） */
export function currentVendorOf(
  currentVendor: BulkVendorSelection,
  vendors: readonly BulkVendor[],
): RowVendorOf {
  const vendor = vendors.find((v) => v.vendorName === currentVendor.name);
  const value: RowVendor = { ...currentVendor, emergencyContact: vendor?.emergencyContact || '' };
  return () => value;
}

/**
 * 管理会社の保守会社フィルター（複数選択）。空 = すべて。選んだ値（保守会社の id か「保守会社未設定」）のどれかに合えば表示。
 * 判定はマスター管理の物件タブ（修正依頼1115 (4)）と同じ vendorRowMatches
 */
export function matchesVendorSelection(
  vendorId: string | null | undefined,
  selected: readonly string[],
): boolean {
  if (selected.length === 0) return true;
  return selected.some((f) => vendorRowMatches(vendorId, f));
}

/** 保守会社フィルターの1社（テンプレートの略称・絞り込みに使う）。1社だけ選んでいるときだけ、未設定は除く */
export function singleSelectedVendor(selected: readonly string[]): string | null {
  return selected.length === 1 && selected[0] !== VENDOR_UNSET ? selected[0]! : null;
}
