import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { useBulkStore, resetBulkSession } from '@/stores/bulkStore';
import { AUTO_SAVE_TTL_MS, readAutoSave } from '../utils/bulkAutoSave';
import { applySettings, DEFAULT_BULK_SETTINGS, flattenProperties } from '../utils/bulkMaster';
import type { BulkMasterData } from '../types';
import { createMemoryStorage } from './memoryStorage';

const master: BulkMasterData = {
  properties: [
    { propertyCode: 'z0001A01', propertyName: '物件A', terminalId: 'T-A1', supplement: '' },
    { propertyCode: 'z0001A01', propertyName: '物件A', terminalId: 'T-A2', supplement: '' },
    { propertyCode: '120442-00', propertyName: '物件B', terminalId: 'T-B1', supplement: '' },
  ],
  vendors: [{ id: 'v1', vendorName: 'A社', emergencyContact: '' }],
  notices: [{ inspectionType: '消防設備点検', templateNo: '7', noticeText: '' }],
};

const s = () => useBulkStore.getState();

describe('bulkStore (v1 js/bulk-table.js / bulk-modals.js の行操作)', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date', 'setTimeout', 'clearTimeout'] });
    vi.setSystemTime(new Date('2026-10-14T15:30:00Z'));
    vi.stubGlobal('localStorage', createMemoryStorage());
    resetBulkSession();
    s().setUserId('user-1');
    s().setMasterData(master);
    s().setAppSettings(applySettings(DEFAULT_BULK_SETTINGS, [{ setting_key: 'display_time_default', setting_value: '10' }]));
    s().setCurrentVendor({ id: 'v1', name: 'A社' });
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it('new row defaults: today (UTC date), current vendor, display time from settings, position 2', () => {
    s().addRow();
    expect(s().rows[0]).toMatchObject({
      id: 1,
      startDate: '2026-10-14',
      vendorName: 'A社',
      displayTime: 10,
      position: 2,
      showOnBoard: true,
      isValid: false,
      errors: ['物件', '点検種別'],
    });
  });

  it('add-row copies the last row except remarks and detail settings', () => {
    s().addRow({ propertyCode: 'z0001A01', terminalId: 'T-A2', inspectionType: '消防設備点検', remarks: 'x', noticeText: '案内', position: 3 });
    s().addRowWithCopy();
    expect(s().rows[1]).toMatchObject({ propertyCode: 'z0001A01', terminalId: 'T-A2', remarks: '', noticeText: '', position: 3, isValid: true });
  });

  it('changing the property picks its first terminal; start date fills an empty end date', () => {
    s().addRow({ propertyCode: 'z0001A01', terminalId: 'T-A2', inspectionType: '消防設備点検' });
    const id = s().rows[0]!.id;
    s().changeProperty(id, '120442-00');
    expect(s().rows[0]!.terminalId).toBe('T-B1');
    s().changeStartDate(id, '2026-12-01');
    expect(s().rows[0]).toMatchObject({ startDate: '2026-12-01', endDate: '2026-12-01' });
  });

  it('a property without terminals stays a terminal error (v1 behaviour, reported as a v1 bug candidate)', () => {
    s().setMasterData({
      ...master,
      properties: flattenProperties([{ property_code: 'NT01', property_name: '端末なし', terminals: [] }], true),
    });
    s().addRow({ propertyCode: 'NT01', inspectionType: '消防設備点検' });
    expect(s().rows[0]!.errors).toEqual(['端末']);
  });

  it('toolbar duplicate keeps the row vendor; menu duplicate uses the current vendor', () => {
    s().addRow({ propertyCode: 'z0001A01', inspectionType: '消防設備点検', vendorName: '旧社' });
    const id = s().rows[0]!.id;
    s().duplicateRows([id]);
    s().duplicateRowFromMenu(id);
    expect(s().rows.map((r) => r.vendorName)).toEqual(['旧社', '旧社', 'A社']);
  });

  it('toolbar duplicate appends in table order, not in the order the rows were checked (v1 getSelectedRowIds)', () => {
    s().addRow({ propertyCode: 'z0001A01', remarks: '上' });
    s().addRow({ propertyCode: '120442-00', remarks: '下' });
    const [top, bottom] = s().rows.map((r) => r.id);
    s().duplicateRows([bottom!, top!]);
    expect(s().rows.map((r) => r.remarks)).toEqual(['上', '下', '上', '下']);
  });

  it('insert-row adds a blank row (no start date, no vendor) at the index', () => {
    s().addRow({ propertyCode: 'z0001A01', inspectionType: '消防設備点検' });
    s().addRow({ propertyCode: '120442-00', inspectionType: '消防設備点検' });
    s().insertRowAt(1);
    expect(s().rows.map((r) => r.propertyCode)).toEqual(['z0001A01', '', '120442-00']);
    expect(s().rows[1]).toMatchObject({ startDate: '', vendorName: '', id: 3 });
  });

  it('drag and drop moves the row after a lower target and before an upper target', () => {
    ['z0001A01', '120442-00', 'z0001A01'].forEach((code) => s().addRow({ propertyCode: code }));
    const [a, b, c] = s().rows.map((r) => r.id);
    s().reorderRows(a!, c!);
    expect(s().rows.map((r) => r.id)).toEqual([b, c, a]);
    s().reorderRows(a!, b!);
    expect(s().rows.map((r) => r.id)).toEqual([a, b, c]);
  });

  it('auto-saves 1 second after the last change and drops data older than 24 hours', () => {
    s().addRow({ propertyCode: 'z0001A01' });
    expect(readAutoSave('user-1')).toBeNull();
    vi.advanceTimersByTime(1000);
    expect(readAutoSave('user-1')).toMatchObject({ rowIdCounter: 1, rows: [{ propertyCode: 'z0001A01' }] });
    vi.setSystemTime(new Date(Date.now() + AUTO_SAVE_TTL_MS + 1));
    expect(readAutoSave('user-1')).toBeNull();
    expect(localStorage.getItem('bulk_autosave_user-1')).toBeNull();
  });
});
