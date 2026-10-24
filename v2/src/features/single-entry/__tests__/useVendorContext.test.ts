import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { useVendorContext } from '../hooks/useVendorContext';
import { PROPERTIES } from './fixtures';
import type { DbVendor } from '@/types/database';

const fetchLinked = vi.fn();
const fetchCodes = vi.fn();

vi.mock('@/lib/supabase', () => ({ supabase: {}, TABLES: {} }));
vi.mock('@/lib/api/single-entry', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/api/single-entry')>()),
  fetchLinkedInspectionIds: (id: string) => fetchLinked(id),
}));
vi.mock('@/lib/api/relationships', () => ({ fetchActivePropertyCodes: (id: string) => fetchCodes(id) }));

const VENDORS = [
  { id: 'A', vendor_name: 'A社', emergency_contact: '1', inspection_type: null, created_at: null },
  { id: 'B', vendor_name: 'B社', emergency_contact: '2', inspection_type: null, created_at: null },
] satisfies DbVendor[];

function deferred<T>() {
  let resolve!: (v: T) => void;
  const promise = new Promise<T>((r) => (resolve = r));
  return { promise, resolve };
}

beforeEach(() => {
  fetchLinked.mockReset();
  fetchCodes.mockReset();
});

describe('管理者の保守会社選択（v1 onAdminVendorChange / adminVendorChangeSeq）', () => {
  it('読み込み中は物件を出さず、速く切り替えたら最後の保守会社の結果だけを反映し、外すと全物件・紐付けなしに戻る', async () => {
    const linkedA = deferred<Set<string>>();
    const linkedB = deferred<Set<string>>();
    fetchLinked.mockImplementation((id: string) => (id === 'A' ? linkedA.promise : linkedB.promise));
    fetchCodes.mockImplementation((id: string) => Promise.resolve(id === 'A' ? ['2010'] : ['z0015A01']));
    const onLinkedLoaded = vi.fn();

    const { result } = renderHook(() =>
      useVendorContext({ isAdmin: true, profileVendorId: null, properties: PROPERTIES, vendors: VENDORS, onLinkedLoaded }),
    );
    expect(result.current.visibleProperties).toHaveLength(3);

    act(() => result.current.selectAdminVendor('A'));
    expect(result.current.visibleProperties).toEqual([]);
    expect(result.current.vendor?.vendor_name).toBe('A社');

    act(() => result.current.selectAdminVendor('B'));
    await act(async () => {
      linkedA.resolve(new Set(['a-only']));
      linkedB.resolve(new Set(['b-only']));
    });

    await waitFor(() => expect(result.current.visibleProperties.map((p) => p.property_code)).toEqual(['z0015A01']));
    expect([...result.current.linkedIds]).toEqual(['b-only']);
    expect(onLinkedLoaded).toHaveBeenCalledTimes(1);
    expect([...onLinkedLoaded.mock.calls[0]![0]]).toEqual(['b-only']);

    act(() => result.current.selectAdminVendor(''));
    expect(result.current.visibleProperties).toHaveLength(3);
    expect(result.current.linkedIds.size).toBe(0);
    // 未選択の管理者は保守会社なし（データを追加で「保守会社を選択してください」）。v1 は社名順の先頭の会社（script.js:952 の
    // #vendor = '0'）だったが、ユーザー決定（2026-10-25）で v1 と意図して変えた
    expect(result.current.vendor).toBeNull();
  });
});

// v1（index.html:363 の #vendor = 0）は一般ユーザーでも社名順の先頭の会社を記録していた。ユーザー決定（2026-10-25）で v1 と意図して変え、
// 自社（profile.vendor_id）を記録する（CSV の受注先名・緊急連絡先にも出る）
describe('一般ユーザーの保守会社', () => {
  it('記録する保守会社も紐付けも自社', async () => {
    fetchLinked.mockResolvedValue(new Set(['b-only']));
    const { result } = renderHook(() =>
      useVendorContext({ isAdmin: false, profileVendorId: 'B', properties: PROPERTIES, vendors: VENDORS, onLinkedLoaded: vi.fn() }),
    );
    expect(result.current.vendor?.vendor_name).toBe('B社');
    await waitFor(() => expect([...result.current.linkedIds]).toEqual(['b-only']));
    expect(fetchLinked).toHaveBeenCalledWith('B');
  });
});
