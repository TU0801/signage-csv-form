import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { useBulkStore, resetBulkSession } from '@/stores/bulkStore';
import { AUTO_SAVE_TTL_MS, readAutoSave } from '../utils/bulkAutoSave';
import { applySettings, DEFAULT_BULK_SETTINGS, flattenProperties } from '../utils/bulkMaster';
import type { BulkMasterData } from '../types';
import { createMemoryStorage } from './memoryStorage';
import { hasUnsentInput, isApplyTarget } from '../utils/scheduleRows';

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

  it('changing to a property without terminals clears the previous terminal (v1 kept it and the row passed)', () => {
    s().setMasterData({
      ...master,
      properties: [...master.properties, ...flattenProperties([{ property_code: 'NT01', property_name: '端末なし', terminals: [] }], true)],
    });
    s().addRow({ propertyCode: 'z0001A01', terminalId: 'T-A1', inspectionType: '消防設備点検' });
    const id = s().rows[0]!.id;
    s().changeProperty(id, 'NT01');
    expect(s().rows[0]).toMatchObject({ terminalId: '', isValid: false, errors: ['端末'] });
  });

  it('typing remarks re-validates the row at once (v1 waited for another field to change)', () => {
    s().addRow({ propertyCode: 'z0001A01', inspectionType: '消防設備点検' });
    const id = s().rows[0]!.id;
    s().changeRemarks(id, 'あ'.repeat(26));
    expect(s().rows[0]).toMatchObject({ isValid: false, errors: ['備考文字数(1行25文字以下)'] });
    s().changeRemarks(id, 'あ'.repeat(25));
    expect(s().rows[0]!.isValid).toBe(true);
  });

  it('点検開始日を変えると、終了日が空・旧開始日と同じ・新開始日より前なら新開始日にし、手で入れた後の日は残す（B10）', () => {
    s().addRow({ propertyCode: 'z0001A01', startDate: '2026-11-01', endDate: '2026-11-01' });
    s().addRow({ propertyCode: 'z0001A01', startDate: '2026-11-01', endDate: '2026-11-03' });
    s().addRow({ propertyCode: 'z0001A01', startDate: '2026-11-01', endDate: '2026-11-03' });
    const [same, later, before] = s().rows.map((r) => r.id);
    s().changeStartDate(same!, '2026-11-05');
    s().changeStartDate(later!, '2026-11-02');
    s().changeStartDate(before!, '2026-11-10');
    expect(s().rows.map((r) => r.endDate)).toEqual(['2026-11-05', '2026-11-03', '2026-11-10']);
  });

  it('物件を選んで点検種別が空なら、その物件の保守会社の点検行 → 無ければ保守会社に紐付けた点検種別の先頭を入れる（B9）', () => {
    s().setMasterData({
      ...master,
      notices: [
        { id: 't-ev', inspectionType: 'エレベーター定期点検', templateNo: '1', noticeText: '' },
        { id: 't-fire', inspectionType: '消防設備点検', templateNo: '7', noticeText: '' },
        { id: 't-clean', inspectionType: '定期清掃', templateNo: '3', noticeText: '' },
      ],
    });
    s().setInspectionDefaults({
      // 物件Bの点検行は 定期清掃・消防設備点検（マスターの並び順で消防設備点検が先）
      vendorInspections: [
        { propertyCode: '120442-00', label: '定期清掃' },
        { propertyCode: '120442-00', label: '消防設備点検' },
      ],
      linkedIds: ['t-clean', 't-ev'],
    });
    s().addRow();
    s().addRow();
    s().addRow({ inspectionType: '定期清掃' });
    const [b, a, kept] = s().rows.map((r) => r.id);
    s().changeProperty(b!, '120442-00');
    s().changeProperty(a!, 'z0001A01');
    s().changeProperty(kept!, '120442-00');
    expect(s().rows.map((r) => r.inspectionType)).toEqual(['消防設備点検', 'エレベーター定期点検', '定期清掃']);
  });

  it('点検予定の行は入れ直しても入力中の値を残し、自動保存・テンプレートの置き換えでは消えない', () => {
    const meta = { key: 'i1:2026-11-01', inspectionId: 'i1', targetMonth: '2026-11-01', locked: false, propertyName: '物件Z', terminalIds: [] };
    s().syncScheduleRows([{ meta, row: { propertyCode: 'z9999A01', inspectionType: '消防設備点検' } }]);
    s().addRow({ propertyCode: 'z0001A01', inspectionType: '消防設備点検' });
    const scheduleId = s().rows[0]!.id;
    // 保守会社の物件マスターに無い物件・端末0台でも、予定の行はエラーにしない（点検一覧の申請と同じ）
    expect(s().rows[0]).toMatchObject({ isValid: true, startDate: '' });
    s().changeStartDate(scheduleId, '2026-11-12');
    s().syncScheduleRows([{ meta, row: { propertyCode: 'z9999A01', inspectionType: '消防設備点検' } }]);
    expect(s().rows[0]).toMatchObject({ id: scheduleId, startDate: '2026-11-12', endDate: '2026-11-12' });
    vi.advanceTimersByTime(1000);
    const saved = JSON.parse(localStorage.getItem('bulk_autosave_user-1')!) as { rows: { propertyCode: string }[] };
    expect(saved.rows.map((r) => r.propertyCode)).toEqual(['z0001A01']);
    s().replaceRows([{ propertyCode: '120442-00' }]);
    expect(s().rows.map((r) => r.propertyCode)).toEqual(['z9999A01', '120442-00']);
    // 申請済みになったら読み取り（入力していた値は申請の値に置き換わる）
    s().syncScheduleRows([{ meta: { ...meta, locked: true }, row: { propertyCode: 'z9999A01', startDate: '2026-11-20' } }]);
    expect(s().rows[0]).toMatchObject({ startDate: '2026-11-20', schedule: { locked: true } });
  });

  it('申請した予定の行の入力を空に戻すと、読み直しても申請の対象・未送信の入力にならない（点検月未登録の行）', () => {
    const meta = { key: 'i1:unscheduled', inspectionId: 'i1', targetMonth: null, locked: false, propertyName: '物件Z', terminalIds: [] };
    s().syncScheduleRows([{ meta, row: { propertyCode: 'z9999A01', inspectionType: '消防設備点検' } }]);
    const id = s().rows[0]!.id;
    s().changeStartDate(id, '2026-11-05');
    s().changeMemo(id, 'メモ');
    expect(hasUnsentInput(s().rows[0]!)).toBe(true);
    s().clearScheduleInputs([id]);
    s().syncScheduleRows([{ meta, row: { propertyCode: 'z9999A01', inspectionType: '消防設備点検' } }]);
    const row = s().rows[0]!;
    expect(row).toMatchObject({ id, startDate: '', endDate: '', memo: '', inspectionType: '消防設備点検' });
    expect(isApplyTarget(row)).toBe(false);
    expect(hasUnsentInput(row)).toBe(false);
  });

  it('予定の行で詳細設定（追加の貼紙・連絡先）だけを入れても未送信の入力として扱う（予定の行は自動保存されないため）', () => {
    const meta = { key: 'i1:unscheduled', inspectionId: 'i1', targetMonth: null, locked: false, propertyName: '物件Z', terminalIds: [] };
    s().syncScheduleRows([{ meta, row: { propertyCode: 'z9999A01', inspectionType: '消防設備点検' } }]);
    const row = s().rows[0]!;
    expect(hasUnsentInput(row)).toBe(false);
    expect(hasUnsentInput({ ...row, posterType: 'custom' as const })).toBe(true);
    expect(hasUnsentInput({ ...row, emergencyContact: '03-1111-2222' })).toBe(true);
  });

  it('bulk apply overwrites only the given fields on the given rows and fills an empty end date', () => {
    s().addRow({ propertyCode: 'z0001A01', remarks: '残す', position: 3 });
    s().addRow({ propertyCode: '120442-00', endDate: '2026-12-31' });
    s().addRow({ propertyCode: '120442-00' });
    const [a, b] = s().rows.map((r) => r.id);
    s().applyToRows([a!, b!], { inspectionType: '消防設備点検', startDate: '2026-12-01' });
    expect(s().rows[0]).toMatchObject({ inspectionType: '消防設備点検', startDate: '2026-12-01', endDate: '2026-12-01', remarks: '残す', position: 3, isValid: true });
    expect(s().rows[1]).toMatchObject({ inspectionType: '消防設備点検', endDate: '2026-12-31', isValid: true });
    expect(s().rows[2]).toMatchObject({ inspectionType: '', isValid: false });
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
