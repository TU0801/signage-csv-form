import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  approveEntry,
  entryErrorReason,
  fetchApprovedEntries,
  updateEntryDisplaySettings,
} from '@/lib/api/admin-entries';
import { makeEntry } from './fixtures';

type Call = [string, ...unknown[]];
const calls: Call[] = [];
let result: { data: unknown; error: unknown } = { data: [], error: null };

/** PostgREST のメソッドチェーンを記録し、await で result を返す */
function builder() {
  const b: Record<string, unknown> = {};
  for (const m of ['select', 'eq', 'is', 'in', 'gte', 'lte', 'order', 'update', 'delete', 'single', 'maybeSingle']) {
    b[m] = (...args: unknown[]) => {
      calls.push([m, ...args]);
      return b;
    };
  }
  b.then = (resolve: (v: unknown) => void) => resolve(result);
  return b;
}

vi.mock('@/lib/supabase', () => ({
  supabase: {
    from: (table: string) => {
      calls.push(['from', table]);
      return builder();
    },
  },
  TABLES: {
    entries: 'signage_entries',
    profiles: 'signage_profiles',
    settings: 'signage_master_settings',
  },
}));

beforeEach(() => {
  calls.length = 0;
  result = { data: [], error: null };
});

describe('lib/api/admin-entries', () => {
  it('fetchApprovedEntries: approved only, period on inspection_start (v1 getAllEntries + statusArray)', async () => {
    result = { data: [makeEntry()], error: null };
    const rows = await fetchApprovedEntries({
      propertyCode: '2010',
      startDate: '2026-11-01',
      endDate: '2026-11-30',
      vendorName: '山田エレベーター',
    });
    expect(rows).toHaveLength(1);
    expect(calls).toEqual([
      ['from', 'signage_entries'],
      ['select', '*'],
      ['order', 'created_at', { ascending: false }],
      ['eq', 'property_code', '2010'],
      ['gte', 'inspection_start', '2026-11-01'],
      ['lte', 'inspection_start', '2026-11-30'],
      ['in', 'status', ['ready', 'exported']],
      ['eq', 'vendor_name', '山田エレベーター'],
    ]);
  });

  it('approveEntry approves only the version the screen read; a 0-row update (edited since) is an error', async () => {
    result = { data: [makeEntry()], error: null };
    await approveEntry('id-1', '2026-10-26T01:02:03.456789+00:00');
    expect(calls).toEqual([
      ['from', 'signage_entries'],
      ['update', { status: 'ready' }],
      ['eq', 'id', 'id-1'],
      ['eq', 'updated_at', '2026-10-26T01:02:03.456789+00:00'],
      ['select'],
    ]);
    // 読んだ後に保守会社が直していたら（版が違い0行）、承認せずに断る（修正依頼1026 I11）
    result = { data: [], error: null };
    await expect(approveEntry('id-1', '2026-10-26T01:02:03.456789+00:00')).rejects.toThrow('申請が修正されました');
  });

  it('updateEntryDisplaySettings uses select().single() so a 0-row update is an error', async () => {
    result = { data: null, error: { code: 'PGRST116', message: 'JSON object requested, multiple (or no) rows returned' } };
    await expect(
      updateEntryDisplaySettings('id-2', {
        display_start_date: null,
        display_start_time: null,
        display_end_date: null,
        display_end_time: null,
        display_duration: 6,
        poster_position: '4',
      }),
    ).rejects.toMatchObject({ code: 'PGRST116' });
    expect(calls[1]).toEqual([
      'update',
      {
        display_start_date: null,
        display_start_time: null,
        display_end_date: null,
        display_end_time: null,
        display_duration: 6,
        poster_position: '4',
      },
    ]);
  });

  it('entryErrorReason: keeps the Japanese trigger text (42501), translates English (v1 translateError)', () => {
    expect(
      entryErrorReason({ code: '42501', message: '承認済みのデータは削除できません（管理者にお問い合わせください）' }),
    ).toBe('承認済みのデータは削除できません（管理者にお問い合わせください）');
    expect(entryErrorReason({ code: '42501', message: 'new row violates row-level security policy' })).toBe(
      '権限がありません',
    );
    expect(entryErrorReason({ code: '23505', message: 'duplicate key value violates unique constraint' })).toBe(
      'すでに登録されています',
    );
    expect(entryErrorReason(new Error('Failed to fetch'))).toBe('操作に失敗しました');
  });
});
