import type { BulkEntryRow, BulkRowInput, BulkVendorSelection } from '../types';

/** v1 と同じキー（v1 で保存したテンプレートをそのまま使えるように） */
export const TEMPLATE_STORAGE_KEY = 'bulk_templates';

/** 形式: [{ id, name, vendorId, vendorName, createdAt, rows }]。vendorId=null は全社共通 */
export interface BulkTemplate {
  id: string;
  name: string;
  vendorId: string | null;
  vendorName: string | null;
  createdAt: number | null;
  rows: BulkRowInput[];
}

// v1: js/bulk-modals.js genTemplateId
function genTemplateId(): string {
  try {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
      return crypto.randomUUID();
    }
  } catch {
    // crypto が使えなければ下へ
  }
  return `tpl_${Date.now()}_${Math.floor(Math.random() * 1e9)}`;
}

/** 書き込み失敗（容量超過・拒否）は警告だけにする。v1: js/bulk-modals.js setStoredTemplates */
export function setStoredTemplates(templates: BulkTemplate[]): void {
  try {
    localStorage.setItem(TEMPLATE_STORAGE_KEY, JSON.stringify(templates));
  } catch (e) {
    console.warn('Failed to save bulk_templates to localStorage:', e);
  }
}

/**
 * 保存済みテンプレート。旧形式（{ [name]: {...} }）は配列形式へ移して書き戻す（企業情報が無いので全社共通扱い）。
 * v1: js/bulk-modals.js getStoredTemplates
 */
export function getStoredTemplates(): BulkTemplate[] {
  let raw: unknown;
  try {
    raw = JSON.parse(localStorage.getItem(TEMPLATE_STORAGE_KEY) || '[]');
  } catch (e) {
    console.warn('Failed to parse bulk_templates from localStorage:', e);
    return [];
  }
  if (raw && !Array.isArray(raw) && typeof raw === 'object') {
    const migrated = Object.entries(raw as Record<string, Partial<BulkTemplate> | null>).map(([name, t]) => ({
      id: genTemplateId(),
      name,
      vendorId: (t && t.vendorId) || null,
      vendorName: (t && t.vendorName) || null,
      createdAt: (t && t.createdAt) || null,
      rows: (t && t.rows) || [],
    }));
    setStoredTemplates(migrated);
    return migrated;
  }
  return Array.isArray(raw) ? (raw as BulkTemplate[]) : [];
}

/** 選択中の保守会社のテンプレートと全社共通だけ。v1: js/bulk-modals.js getVisibleTemplates */
export function getVisibleTemplates(vendorId: string | null): BulkTemplate[] {
  return getStoredTemplates().filter((t) => !t.vendorId || t.vendorId === vendorId);
}

/** ドロップダウンの表示名（全社共通は同名の企業別と区別できるよう接尾辞）。v1: js/bulk-modals.js loadTemplates */
export function templateLabel(t: BulkTemplate): string {
  return t.vendorId ? t.name : `${t.name}（全社共通）`;
}

/**
 * 今の行をテンプレートとして保存する。同じ保守会社に同名があれば上書き、なければ追加。
 * 行には保守会社名・点検日・備考を保存しない（適用時は今の保守会社と今日の日付で行を作る）。
 * v1: js/bulk-modals.js saveTemplate
 */
export function saveTemplate(name: string, rows: BulkEntryRow[], vendor: BulkVendorSelection): void {
  const templates = getStoredTemplates();
  const rowsData: BulkRowInput[] = rows.map((r) => ({
    propertyCode: r.propertyCode,
    terminalId: r.terminalId,
    inspectionType: r.inspectionType,
    displayTime: r.displayTime,
    noticeText: r.noticeText,
    displayStartDate: r.displayStartDate,
    displayStartTime: r.displayStartTime,
    displayEndDate: r.displayEndDate,
    displayEndTime: r.displayEndTime,
    showOnBoard: r.showOnBoard,
    position: r.position,
  }));

  const existing = templates.find((t) => t.name === name && (t.vendorId || null) === (vendor.id || null));
  if (existing) {
    existing.rows = rowsData;
    existing.createdAt = Date.now();
    existing.vendorName = vendor.name || null;
  } else {
    templates.push({
      id: genTemplateId(),
      name,
      vendorId: vendor.id || null,
      vendorName: vendor.name || null,
      createdAt: Date.now(),
      rows: rowsData,
    });
  }
  setStoredTemplates(templates);
}

/** v1: js/bulk-modals.js deleteTemplate（確認は呼び出し側） */
export function deleteTemplate(id: string): void {
  setStoredTemplates(getStoredTemplates().filter((t) => t.id !== id));
}

/** 適用する行（rows が壊れていても落ちない）。v1: js/bulk-modals.js applyTemplate */
export function templateRows(t: BulkTemplate): BulkRowInput[] {
  return Array.isArray(t.rows) ? t.rows : [];
}
