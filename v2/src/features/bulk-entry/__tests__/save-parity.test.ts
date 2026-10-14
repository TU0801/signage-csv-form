import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { buildBulkEntries } from '../utils/buildBulkEntries';
import { writeAutoSave, autoSaveKey } from '../utils/bulkAutoSave';
import { applySettings, DEFAULT_BULK_SETTINGS } from '../utils/bulkMaster';
import { createBulkEntries } from '@/lib/api/bulk-entry';
import type { BulkEntryRow, BulkMasterData } from '../types';
import { createMemoryStorage } from './memoryStorage';

/**
 * 申請（signage_entries への INSERT）と自動保存の中身が v1 と同じことを確かめる。
 * v1 の saveAll が createEntries に渡す配列をスタブで受け取って比べる。
 */
const v1Create = vi.hoisted(() => ({ calls: [] as unknown[][] }));
vi.mock('../../../../../js/supabase-client.js', () => ({
  createEntries: async (entries: unknown[]) => {
    v1Create.calls.push(entries);
    return entries;
  },
}));

const mockInsert = vi.fn();
vi.mock('@/lib/supabase', () => ({
  supabase: {
    from: (table: string) => ({
      insert: (rows: unknown[]) => {
        mockInsert(table, rows);
        return { select: async () => ({ data: rows, error: null }) };
      },
    }),
  },
  TABLES: { entries: 'signage_entries', settings: 'signage_master_settings' },
}));

// @ts-expect-error v1 の素の JS モジュール（型宣言なし）
import * as v1Data from '../../../../../js/bulk-data.js';
// @ts-expect-error v1 の素の JS モジュール（型宣言なし）
import * as v1State from '../../../../../js/bulk-state.js';

const master: BulkMasterData = {
  properties: [{ propertyCode: 'z0001A01', propertyName: '物件A', terminalId: 'T-A1', supplement: '' }],
  vendors: [{ id: 'v1', vendorName: '株式会社テスト保守', emergencyContact: '092-000-0000' }],
  notices: [{ inspectionType: 'エレベーター定期点検', templateNo: '12', noticeText: '定型文' }],
};
const settingsRows = [{ setting_key: 'display_time_default', setting_value: '10' }];

function row(over: Partial<BulkEntryRow>): BulkEntryRow {
  return {
    id: 1,
    propertyCode: 'z0001A01',
    terminalId: 'T-A1',
    vendorName: '株式会社テスト保守',
    inspectionType: 'エレベーター定期点検',
    startDate: '2026-11-02',
    endDate: '2026-11-03',
    remarks: '',
    displayTime: 10,
    noticeText: '',
    displayStartDate: '',
    displayStartTime: '',
    displayEndDate: '',
    displayEndTime: '',
    showOnBoard: true,
    position: 2,
    isValid: true,
    errors: [],
    ...over,
  };
}

const rows = [
  row({ id: 1 }),
  row({
    id: 2,
    showOnBoard: false,
    position: 0,
    noticeText: '独自',
    remarks: '備考',
    displayStartDate: '2026-10-20',
    displayStartTime: '08:00',
    displayEndDate: '2026-11-04',
    displayEndTime: '18:00',
    displayTime: 0,
    endDate: '',
  }),
  row({ id: 3, isValid: false }),
];

describe('bulk submit / auto-save parity with v1 js/bulk-data.js', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    // JST 00:30 は UTC では前日（表示開始日の既定「今日」は v1 と同じく UTC の日付）
    vi.setSystemTime(new Date('2026-10-14T15:30:00Z'));
    document.body.innerHTML = '<button id="saveBtn"></button><table><tbody id="tableBody"></tbody></table>';
    v1State.setMasterData(master);
    v1State.setCurrentVendor('v1', '株式会社テスト保守');
    v1State.setAppSettings(settingsRows);
    v1State.setCurrentUserId('user-1');
    v1Create.calls = [];
    mockInsert.mockClear();
    vi.stubGlobal('localStorage', createMemoryStorage());
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
    document.body.innerHTML = '';
  });

  it('builds the same insert payload as v1 saveAll (valid rows only, status draft)', async () => {
    v1State.state.rows = rows.map((r) => ({ ...r }));
    const noop = () => {};
    await v1Data.saveAll({ showToast: noop, updateStats: noop, updateEmptyState: noop, updateButtons: noop });
    const expected = v1Create.calls[0];

    const actual = buildBulkEntries(
      rows,
      master,
      { id: 'v1', name: '株式会社テスト保守' },
      applySettings(DEFAULT_BULK_SETTINGS, settingsRows),
    );
    expect(actual).toEqual(expected);
    expect(actual).toHaveLength(2);
    expect(actual[1]).toMatchObject({
      poster_type: 'custom',
      poster_position: '0',
      display_start_date: '2026-10-20',
      display_end_date: '2026-11-04',
      display_duration: 10,
      status: 'draft',
    });
    expect(actual[0]!.display_start_date).toBe('2026-10-14');
  });

  it('inserts all entries in one call with the user id', async () => {
    const entries = buildBulkEntries(rows, master, { id: 'v1', name: '株式会社テスト保守' }, DEFAULT_BULK_SETTINGS);
    await createBulkEntries(entries, 'user-1');
    expect(mockInsert).toHaveBeenCalledTimes(1);
    const [table, inserted] = mockInsert.mock.calls[0]!;
    expect(table).toBe('signage_entries');
    expect(inserted).toHaveLength(2);
    expect((inserted as { user_id: string }[]).every((e) => e.user_id === 'user-1')).toBe(true);
  });

  it('writes the same auto-save JSON under the v1 key', () => {
    v1State.state.rows = rows.map((r) => ({ ...r }));
    v1State.setRowIdCounter(3);
    v1Data.saveAutoSave();
    const expected = localStorage.getItem('bulk_autosave_user-1');
    localStorage.clear();

    writeAutoSave('user-1', rows, 3);
    expect(autoSaveKey('user-1')).toBe('bulk_autosave_user-1');
    expect(localStorage.getItem('bulk_autosave_user-1')).toBe(expected);
  });
});
