import { normalizeTerminalId } from '@/lib/terminal';
import type { MasterData } from '@/types/app';
import type { DbProperty, DbSetting } from '@/types/database';
import type { BulkMasterData, BulkProperty, BulkSettings } from '../types';

/** v1: js/bulk-state.js state.appSettings の初期値 */
export const DEFAULT_BULK_SETTINGS: BulkSettings = {
  display_time_max: 30,
  display_time_default: 6,
  remarks_chars_per_line: 25,
  remarks_max_lines: 5,
  notice_text_max_chars: 200,
};

export const EMPTY_BULK_MASTER: BulkMasterData = { properties: [], vendors: [], notices: [] };

/**
 * 設定行を反映する（値は parseInt。0 や数字でない値は文字列のまま）。
 * v1: js/bulk-state.js setAppSettings
 */
export function applySettings(base: BulkSettings, rows: Pick<DbSetting, 'setting_key' | 'setting_value'>[] | null): BulkSettings {
  const next: BulkSettings = { ...base };
  if (!rows) return next;
  rows.forEach((s) => {
    if (s.setting_key && s.setting_value !== undefined) {
      next[s.setting_key] = parseInt(s.setting_value) || s.setting_value;
    }
  });
  return next;
}

/** 表示時間の既定値（v1 の `getAppSettings().display_time_default || 6`） */
export function defaultDisplayTime(settings: BulkSettings): number {
  return Number(settings.display_time_default || 6);
}

/**
 * 物件を端末ごとの行に展開する。端末の無い物件は includeNoTerminal のときだけ terminalId='' の1行で残す。
 * v1: js/supabase/master-data.js getAllMasterDataCamelCase の properties（一括入力の初期表示は includeNoTerminal なし）
 *     js/bulk.js 保守会社選択時の buildingsCamelCase（端末の無い物件も残す。0913 依頼①）
 */
export function flattenProperties(
  rows: Pick<DbProperty, 'property_code' | 'property_name' | 'terminals'>[],
  includeNoTerminal: boolean,
): BulkProperty[] {
  const out: BulkProperty[] = [];
  rows.forEach((p) => {
    const terminals = Array.isArray(p.terminals) ? p.terminals : [];
    if (terminals.length === 0) {
      if (includeNoTerminal) {
        out.push({ propertyCode: p.property_code, propertyName: p.property_name, terminalId: '', supplement: '' });
      }
      return;
    }
    terminals.forEach((t) => {
      out.push({
        propertyCode: p.property_code,
        propertyName: p.property_name,
        terminalId: normalizeTerminalId(t),
        supplement: t.supplement || '',
      });
    });
  });
  return out;
}

/**
 * 共有のマスターデータを一括入力の形にする（物件は端末ありだけ）。
 * v1: js/supabase/master-data.js getAllMasterDataCamelCase（vendors / notices の変換）
 */
export function toBulkMasterData(data: MasterData): BulkMasterData {
  return {
    properties: flattenProperties(
      data.properties.map((p) => ({
        property_code: p.property_code,
        property_name: p.property_name,
        terminals: p.terminals,
      })),
      false,
    ),
    vendors: data.vendors.map((v) => ({
      id: v.id,
      vendorName: v.vendor_name,
      emergencyContact: v.emergency_contact || '',
    })),
    notices: data.inspectionTypes.map((it) => ({
      id: it.id,
      inspectionType: it.inspection_name,
      templateNo: it.template_no || '',
      noticeText: it.default_text || '',
    })),
  };
}

/** 物件セレクトの選択肢（物件コードで重複を除く）。v1: js/bulk-table.js renderRow の uniqueProperties */
export function uniqueProperties(properties: BulkProperty[]): BulkProperty[] {
  return [...new Map(properties.map((p) => [p.propertyCode, p])).values()];
}

/** 物件の端末ID一覧（空は除く）。v1: js/bulk-table.js updateTerminals */
export function terminalIdsFor(properties: BulkProperty[], propertyCode: string): string[] {
  const code = String(propertyCode);
  return properties
    .filter((p) => String(p.propertyCode) === code)
    .map((p) => p.terminalId)
    .filter((id) => !!id);
}

/**
 * 物件に合わせて端末を決める。
 * - preserve（貼り付け・復元・行追加）: 指定端末が物件にあれば採用、無ければ空（端末エラーで気づける）、未指定なら最初の端末
 * - 画面で物件を変えたとき: 最初の端末。端末の無い物件なら空（前の物件の端末を残すと別物件の端末で申請される。v1 はここが残るバグ）
 * マスターに無い物件コードなら今の値のまま。
 * v1: js/bulk-table.js updateTerminals
 */
export function resolveTerminal(
  properties: BulkProperty[],
  propertyCode: string,
  currentTerminalId: string,
  preserve: boolean,
): string {
  const code = String(propertyCode);
  if (!properties.some((p) => String(p.propertyCode) === code)) return currentTerminalId;
  const ids = terminalIdsFor(properties, propertyCode);
  if (preserve) {
    if (currentTerminalId && ids.includes(currentTerminalId)) return currentTerminalId;
    if (currentTerminalId) return '';
    return ids[0] ?? currentTerminalId;
  }
  return ids[0] ?? '';
}
