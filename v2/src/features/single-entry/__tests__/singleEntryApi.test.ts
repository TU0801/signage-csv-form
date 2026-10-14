import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  fetchAppSettings,
  fetchLinkedInspectionIds,
  fetchMyEntriesThisMonth,
  insertEntries,
  startOfMonthIso,
} from '@/lib/api/single-entry';

const mockFrom = vi.fn();

vi.mock('@/lib/supabase', () => ({
  supabase: { from: (...args: unknown[]) => mockFrom(...args) },
  TABLES: {
    entries: 'signage_entries',
    settings: 'signage_master_settings',
    vendorInspections: 'signage_vendor_inspections',
  },
}));

/** supabase-js のクエリビルダーの代わり。呼び出しを記録し、await されたら result を返す */
function builder(result: { data: unknown; error: unknown }) {
  const calls: [string, ...unknown[]][] = [];
  const b: Record<string, unknown> = {};
  for (const m of ['select', 'eq', 'gte', 'order', 'insert']) {
    b[m] = (...args: unknown[]) => {
      calls.push([m, ...args]);
      return b;
    };
  }
  b.then = (resolve: (v: unknown) => unknown) => Promise.resolve(result).then(resolve);
  return { b, calls };
}

beforeEach(() => {
  mockFrom.mockReset();
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

describe('設定（v1 settings.js getSettings + index.html の appSettings）', () => {
  it('実DBの文字列値を数値にして既定値に被せ、読めなければ既定値', async () => {
    const { b } = builder({
      data: [
        { setting_key: 'display_time_default', setting_value: '10' },
        { setting_key: 'display_time_max', setting_value: '30' },
        { setting_key: 'unknown_key', setting_value: '1' },
      ],
      error: null,
    });
    mockFrom.mockReturnValueOnce(b);
    expect(await fetchAppSettings()).toEqual({
      display_time_max: 30,
      display_time_default: 10,
      remarks_chars_per_line: 25,
      remarks_max_lines: 5,
      notice_text_max_chars: 200,
    });

    mockFrom.mockReturnValueOnce(builder({ data: null, error: { message: 'permission denied' } }).b);
    expect((await fetchAppSettings()).display_time_default).toBe(6);
  });
});

describe('紐付け点検種別（v1 relationships.js getVendorInspections）', () => {
  it('保守会社の active な inspection_id を集め、失敗したら空集合', async () => {
    const { b, calls } = builder({ data: [{ inspection_id: 'a' }, { inspection_id: 'b' }, { inspection_id: null }], error: null });
    mockFrom.mockReturnValueOnce(b);
    expect([...(await fetchLinkedInspectionIds('v1'))]).toEqual(['a', 'b']);
    expect(mockFrom).toHaveBeenCalledWith('signage_vendor_inspections');
    expect(calls).toContainEqual(['eq', 'vendor_id', 'v1']);
    expect(calls).toContainEqual(['eq', 'status', 'active']);

    mockFrom.mockReturnValueOnce(builder({ data: null, error: { message: 'x' } }).b);
    expect((await fetchLinkedInspectionIds('v1')).size).toBe(0);
  });
});

describe('今月の自分のエントリー（v1 entries.js getUserEntriesCurrentMonth）', () => {
  it('自分の行を端末の時刻で今月1日 0:00 以降、新しい順に読む', async () => {
    const { b, calls } = builder({ data: [{ id: 'e1' }], error: null });
    mockFrom.mockReturnValueOnce(b);
    const now = new Date(2026, 9, 15, 8, 0); // JST 2026-10-15 08:00
    expect(await fetchMyEntriesThisMonth('u1', now)).toEqual([{ id: 'e1' }]);
    expect(startOfMonthIso(now)).toBe('2026-09-30T15:00:00.000Z'); // = JST 10/1 0:00
    expect(calls).toContainEqual(['eq', 'user_id', 'u1']);
    expect(calls).toContainEqual(['gte', 'created_at', '2026-09-30T15:00:00.000Z']);
    expect(calls).toContainEqual(['order', 'created_at', { ascending: false }]);
  });
});

describe('申請（v1 entries.js createEntries）', () => {
  it('全件を1回の INSERT で送り、エラーはそのまま投げる', async () => {
    const { b, calls } = builder({ data: [{ id: 'n1' }, { id: 'n2' }], error: null });
    mockFrom.mockReturnValueOnce(b);
    const rows = [{ property_code: 'a' }, { property_code: 'b' }] as unknown as Parameters<typeof insertEntries>[0];
    expect(await insertEntries(rows)).toHaveLength(2);
    expect(calls.filter((c) => c[0] === 'insert')).toEqual([['insert', rows]]);

    const err = { message: 'new row violates row-level security policy' };
    mockFrom.mockReturnValueOnce(builder({ data: null, error: err }).b);
    await expect(insertEntries(rows)).rejects.toBe(err);
  });
});
