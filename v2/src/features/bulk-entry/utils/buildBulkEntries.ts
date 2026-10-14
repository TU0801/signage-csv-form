import { normalizeTerminalId } from '@/lib/terminal';
import type { BulkEntryInsert } from '@/lib/api/bulk-entry';
import type { BulkEntryRow, BulkMasterData, BulkSettings, BulkVendorSelection } from '../types';

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
): BulkEntryInsert[] {
  return rows
    .filter((r) => r.isValid)
    .map((row) => {
      const vendor = masterData.vendors.find((v) => v.vendorName === currentVendor.name);
      const inspection = masterData.notices.find((i) => i.inspectionType === row.inspectionType);
      const today = new Date().toISOString().split('T')[0]!;

      return {
        property_code: String(row.propertyCode),
        // v1 は物件マスターの property?.terminal_id にも落ちるが、camelCase の物件に terminal_id は無いので常に空
        terminal_id: normalizeTerminalId(row.terminalId) || '',
        // 管理者が保守会社を選んでいないと null になり、NOT NULL で INSERT が失敗する（v1 と同じ）
        vendor_name: currentVendor.name as string,
        emergency_contact: vendor?.emergencyContact || '',
        inspection_type: row.inspectionType,
        template_no: inspection?.templateNo || '',
        inspection_start: row.startDate || null,
        inspection_end: row.endDate || null,
        remarks: row.remarks || '',
        announcement: row.noticeText || inspection?.noticeText || '',
        display_start_date: row.displayStartDate || today,
        display_start_time: row.displayStartTime || null,
        display_end_date: row.displayEndDate || row.endDate || null,
        display_end_time: row.displayEndTime || null,
        display_duration: row.displayTime || Number(settings.display_time_default) || 6,
        poster_type: row.showOnBoard !== false ? 'template' : 'custom',
        poster_image: null,
        poster_position: row.position !== undefined ? String(row.position) : '2',
        status: 'draft',
      };
    });
}
