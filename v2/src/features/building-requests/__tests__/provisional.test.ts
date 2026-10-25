import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { useBulkStore, resetBulkSession } from '@/stores/bulkStore';
import { applySettings, DEFAULT_BULK_SETTINGS } from '@/features/bulk-entry/utils/bulkMaster';
import { buildBulkEntries } from '@/features/bulk-entry/utils/buildBulkEntries';
import { createMemoryStorage } from '@/features/bulk-entry/__tests__/memoryStorage';
import type { DbPropertyRequest } from '@/types/database';
import { approvedCodeMap, isUsableRequest, provisionalBuildings, provisionalCode } from '../lib/provisional';

/*
 * 未承認の建物（建物追加の申請）を点検登録フォームで使う（修正依頼1025 F2）
 */

const req = (over: Partial<DbPropertyRequest>): DbPropertyRequest =>
  ({
    id: 'abcdef12-3456-4789-8abc-def012345678',
    vendor_id: 'v1',
    management_company_id: 'm1',
    property_name: '新築マンション',
    inspection_type_id: null,
    inspection_months: [],
    status: 'pending',
    created_property_code: null,
    created_terminal_id: null,
    created_at: '2026-10-20T01:00:00Z',
    ...over,
  }) as DbPropertyRequest;

describe('未承認の建物の候補', () => {
  it('仮の物件コードは DB と同じ REQ-<申請 id の先頭8文字>、使えるのは申請した月（日本時間）の承認待ちだけ', () => {
    expect(provisionalCode('abcdef12-3456-4789-8abc-def012345678')).toBe('REQ-abcdef12');
    const now = new Date('2026-10-31T16:00:00Z'); // 日本時間 11/1 01:00
    // 10/31 23:00 JST の申請は、11/1 の日本時間では先月の申請（再申請が要る）
    expect(isUsableRequest(req({ created_at: '2026-10-31T14:00:00Z' }), now)).toBe(false);
    // 10/31 16:30 UTC＝11/1 01:30 JST の申請は今月
    expect(isUsableRequest(req({ created_at: '2026-10-31T16:30:00Z' }), new Date('2026-11-02T00:00:00Z'))).toBe(true);
    expect(isUsableRequest(req({ status: 'rejected' }), new Date('2026-10-25T00:00:00Z'))).toBe(false);
    expect(provisionalBuildings([req({})], new Date('2026-10-25T00:00:00Z'))).toEqual([
      {
        propertyCode: 'REQ-abcdef12',
        propertyName: '【建物未承認】新築マンション',
        requestId: 'abcdef12-3456-4789-8abc-def012345678',
        managementCompanyId: 'm1',
        inspectionTypeId: null,
      },
    ]);
  });
});

describe('一括入力の未承認の建物の行', () => {
  const s = () => useBulkStore.getState();
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date', 'setTimeout', 'clearTimeout'] });
    vi.setSystemTime(new Date('2026-10-25T03:00:00Z'));
    vi.stubGlobal('localStorage', createMemoryStorage());
    resetBulkSession();
    s().setUserId('user-1');
    s().setMasterData({
      properties: [{ propertyCode: '120442-00', propertyName: '物件B', terminalId: 'T-B1', supplement: '' }],
      vendors: [{ id: 'v1', vendorName: 'A社', emergencyContact: '' }],
      notices: [{ id: 't1', inspectionType: '消防設備点検', templateNo: '7', noticeText: '' }],
    });
    s().setAppSettings(applySettings(DEFAULT_BULK_SETTINGS, []));
    s().setCurrentVendor({ id: 'v1', name: 'A社' });
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it('候補に入れると端末なしでも有効な行になり、申請には property_request_id が入って点検行には結び付けない', () => {
    s().addRow({ propertyCode: 'REQ-abcdef12', inspectionType: '消防設備点検' });
    expect(s().rows[0]!.errors).toEqual(['物件']);
    s().setProvisionalBuildings(provisionalBuildings([req({})]));
    expect(s().rows[0]).toMatchObject({ isValid: true, errors: [], terminalId: '' });

    const [entry] = buildBulkEntries(s().rows, s().masterData, s().currentVendor, s().appSettings, [
      { id: 'pi1', property_code: 'REQ-abcdef12', inspection_type_label: '消防設備点検', inspection_months: [] } as never,
    ]);
    expect(entry).toMatchObject({ property_code: 'REQ-abcdef12', terminal_id: '', property_request_id: req({}).id });
    expect(entry).not.toHaveProperty('property_inspection_id');
  });

  it('承認済みの建物の仮のコードの行（自動保存から戻した行）は承認後の物件コード・端末に付け替える', () => {
    s().addRow({ propertyCode: 'REQ-abcdef12', inspectionType: '消防設備点検' });
    const approved = req({ status: 'approved', created_property_code: '120442-00', created_terminal_id: 'T-B1' });
    s().setProvisionalBuildings(provisionalBuildings([approved]), approvedCodeMap([approved]));
    expect(s().rows[0]).toMatchObject({ propertyCode: '120442-00', terminalId: 'T-B1', isValid: true });
    expect(s().masterData.properties.some((p) => p.propertyRequestId)).toBe(false);
  });
});
