import { normalizeTerminalId } from '@/lib/terminal';
import { todayUtc } from '@/lib/utils';
import { submittedDisplayPeriod } from './rowDetail';
import { monthOf } from '@/features/inspection-portal/lib/schedule';
import {
  matchInspectionLink,
  type InspectionLink,
  type InspectionLinkRow,
} from '@/features/inspection-portal/lib/inspectionLink';
import type { BulkEntryInsert } from '@/lib/api/bulk-entry';
import type { BulkEntryRow, BulkMasterData, BulkSettings, BulkVendorSelection } from '../types';

/** 申請を点検行に結び付けるための、選択中の保守会社の点検行（portal_inspections の一部。1件入力と共有） */
export type BulkInspectionLink = InspectionLinkRow;

/**
 * 申請の点検行・保守会社・対象月（修正依頼1024 B6〜B14）。点検予定の行はその点検行と対象月（点検月の無い点検は点検開始日の月）。
 * 手で足した行は、1件入力と同じ照合（matchInspectionLink: 物件コード＋点検種別＋点検開始日の月が予定にあること、対象月はその月）。一致しなければ紐付けない
 */
export function inspectionLinkOf(
  row: Pick<BulkEntryRow, 'schedule' | 'propertyCode' | 'inspectionType' | 'startDate'>,
  links: BulkInspectionLink[],
  vendorId: string | null,
): InspectionLink | null {
  if (row.schedule) {
    return {
      property_inspection_id: row.schedule.inspectionId,
      vendor_id: vendorId,
      target_month: row.schedule.targetMonth ?? (row.startDate ? monthOf(row.startDate) : null),
    };
  }
  return matchInspectionLink(row, links, vendorId);
}

/**
 * 有効な行を signage_entries に入れる値にする（user_id は API 側で付ける）。
 * 保守会社名は画面上部の保守会社、表示開始日の既定は今日（UTC の日付）、表示終了日の既定は点検終了日、
 * 状態は draft（管理者の承認待ちとして入る。一般ユーザーは guard_entry_approval_flow が pending/draft だけを許す）。
 * v1: js/bulk-data.js saveAll の entries
 */
export function buildBulkEntries(
  rows: BulkEntryRow[],
  masterData: BulkMasterData,
  currentVendor: BulkVendorSelection,
  settings: BulkSettings,
  links: BulkInspectionLink[] = [],
): BulkEntryInsert[] {
  return rows
    .filter((r) => r.isValid)
    .map((row) => {
      const vendor = masterData.vendors.find((v) => v.vendorName === currentVendor.name);
      const inspection = masterData.notices.find((i) => i.inspectionType === row.inspectionType);
      const today = todayUtc();
      // 未承認の建物（建物追加の申請。修正依頼1025 F2）は点検行に結び付けず、申請 id を入れる（建物の承認で付け替わる）
      const requestId = masterData.properties.find(
        (p) => p.propertyRequestId && String(p.propertyCode) === String(row.propertyCode),
      )?.propertyRequestId;
      const link = requestId ? null : inspectionLinkOf(row, links, currentVendor.id);
      const isCustom = row.posterType === 'custom';
      // 詳細設定の畳んだ要約と同じ規則（B18）。過ぎた予定を申請しても表示期間が逆にならないよう today を渡す
      const period = submittedDisplayPeriod(row, today);

      return {
        property_code: String(row.propertyCode),
        // v1 は物件マスターの property?.terminal_id にも落ちるが、camelCase の物件に terminal_id は無いので常に空
        terminal_id: normalizeTerminalId(row.terminalId) || '',
        // 管理者が保守会社を選んでいないと null になり、NOT NULL で INSERT が失敗する（v1 と同じ）
        vendor_name: currentVendor.name as string,
        // 詳細設定で書き換えた連絡先があればそれ、無ければ保守会社マスターの緊急連絡先（B18）
        emergency_contact: row.emergencyContact || vendor?.emergencyContact || '',
        inspection_type: row.inspectionType,
        template_no: inspection?.templateNo || '',
        inspection_start: row.startDate || null,
        inspection_end: row.endDate || null,
        remarks: row.remarks || '',
        announcement: row.noticeText || inspection?.noticeText || '',
        display_start_date: period.startDate || today,
        display_start_time: period.startTime,
        display_end_date: period.endDate,
        display_end_time: period.endTime,
        display_duration: row.displayTime || Number(settings.display_time_default) || 6,
        // 追加の貼紙（B18）は画像の URL を入れる。テンプレートの行で掲示板表示が False（v1 の自動保存・テンプレート由来）は v1 と同じく custom
        poster_type: isCustom || row.showOnBoard === false ? 'custom' : 'template',
        poster_image: isCustom ? row.posterImage || null : null,
        poster_position: row.position !== undefined ? String(row.position) : '2',
        status: 'draft',
        // メモは CSV に出さない（申請の行にだけ残す）
        memo: row.memo || null,
        ...(link ?? {}),
        ...(requestId ? { property_request_id: requestId } : {}),
      };
    });
}
