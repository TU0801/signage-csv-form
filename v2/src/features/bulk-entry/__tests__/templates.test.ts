import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  TEMPLATE_STORAGE_KEY,
  deleteTemplate,
  getStoredTemplates,
  getVisibleTemplates,
  saveTemplate,
  templateLabel,
} from '../utils/bulkTemplates';
import type { BulkEntryRow } from '../types';
import { createMemoryStorage } from './memoryStorage';

/** v1: js/bulk-modals.js のテンプレート（5880d72 で削除と企業別フィルタ） */
const row = (over: Partial<BulkEntryRow> = {}): BulkEntryRow => ({
  id: 1,
  propertyCode: 'z0001A01',
  terminalId: 'T-A1',
  vendorName: 'A社',
  inspectionType: '消防設備点検',
  startDate: '2026-11-02',
  endDate: '2026-11-03',
  remarks: 'メモ',
  memo: '',
  displayTime: 10,
  noticeText: '',
  displayStartDate: '',
  displayStartTime: '',
  displayEndDate: '',
  displayEndTime: '',
  showOnBoard: true,
  emergencyContact: '',
  posterType: 'template',
  posterImage: '',
  position: 2,
  isValid: true,
  errors: [],
  ...over,
});

describe('bulk templates (localStorage bulk_templates)', () => {
  beforeEach(() => {
    vi.stubGlobal('localStorage', createMemoryStorage());
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('migrates the legacy object format to the array format as company-wide templates', () => {
    localStorage.setItem(TEMPLATE_STORAGE_KEY, JSON.stringify({ 旧テンプレ: { rows: [{ propertyCode: 'P1' }] } }));
    const list = getStoredTemplates();
    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({ name: '旧テンプレ', vendorId: null, vendorName: null, rows: [{ propertyCode: 'P1' }] });
    expect(Array.isArray(JSON.parse(localStorage.getItem(TEMPLATE_STORAGE_KEY)!))).toBe(true);
    expect(templateLabel(list[0]!)).toBe('旧テンプレ（全社共通）');
  });

  it('shows only the selected company templates plus company-wide ones, and overwrites same name per company', () => {
    saveTemplate('定期', [row()], { id: 'vA', name: 'A社' });
    saveTemplate('定期', [row(), row({ id: 2 })], { id: 'vA', name: 'A社' }); // 同じ会社の同名は上書き
    saveTemplate('定期', [row()], { id: 'vB', name: 'B社' }); // 別会社なら同名でも別
    saveTemplate('共通', [row()], { id: null, name: null });

    expect(getStoredTemplates()).toHaveLength(3);
    expect(getVisibleTemplates('vA').map((t) => [t.name, t.rows.length])).toEqual([
      ['定期', 2],
      ['共通', 1],
    ]);
    expect(getVisibleTemplates(null).map((t) => t.name)).toEqual(['共通']);
    // 行に保守会社名・点検日・備考は保存しない
    expect(getVisibleTemplates('vB')[0]!.rows[0]).not.toHaveProperty('vendorName');
    expect(getVisibleTemplates('vB')[0]!.rows[0]).not.toHaveProperty('startDate');
    expect(getVisibleTemplates('vB')[0]!.rows[0]).not.toHaveProperty('remarks');
  });

  it('deletes a template by id', () => {
    saveTemplate('消す', [row()], { id: 'vA', name: 'A社' });
    saveTemplate('残す', [row()], { id: 'vA', name: 'A社' });
    const target = getStoredTemplates().find((t) => t.name === '消す')!;
    deleteTemplate(target.id);
    expect(getStoredTemplates().map((t) => t.name)).toEqual(['残す']);
  });
});
