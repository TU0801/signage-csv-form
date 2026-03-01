import { describe, it, expect } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useEntriesFilters } from '../hooks/useEntriesFilters';
import type { DbEntry } from '@/types/database';

const makeEntry = (overrides: Partial<DbEntry>): DbEntry => ({
  id: '1',
  user_id: 'u1',
  property_code: 'P001',
  terminal_id: 'T1',
  vendor_name: 'テスト会社',
  emergency_contact: null,
  inspection_type: '消防点検',
  template_no: null,
  inspection_start: null,
  inspection_end: null,
  display_start_date: null,
  display_start_time: null,
  display_end_date: null,
  display_end_time: null,
  display_duration: null,
  announcement: null,
  remarks: null,
  poster_type: null,
  poster_position: null,
  frame_no: null,
  status: 'ready',
  poster_image: null,
  inspection_co: 1,
  created_at: '2026-01-15T10:00:00Z',
  updated_at: null,
  ...overrides,
});

const entries: DbEntry[] = [
  makeEntry({
    id: '1',
    property_code: 'P001',
    status: 'ready',
    created_at: '2026-01-10T00:00:00Z',
  }),
  makeEntry({
    id: '2',
    property_code: 'P002',
    status: 'draft',
    created_at: '2026-01-20T00:00:00Z',
  }),
  makeEntry({
    id: '3',
    property_code: 'P001',
    status: 'exported',
    created_at: '2026-02-01T00:00:00Z',
  }),
];

describe('useEntriesFilters', () => {
  it('フィルタなしの場合は全件返す', () => {
    const { result } = renderHook(() => useEntriesFilters(entries));
    expect(result.current.filtered).toHaveLength(3);
  });

  it('物件コードでフィルタできる', () => {
    const { result } = renderHook(() => useEntriesFilters(entries));

    act(() => {
      result.current.setFilter('propertyCode', 'P001');
    });

    expect(result.current.filtered).toHaveLength(2);
    expect(result.current.filtered.every((e) => e.property_code === 'P001')).toBe(true);
  });

  it('ステータスでフィルタできる', () => {
    const { result } = renderHook(() => useEntriesFilters(entries));

    act(() => {
      result.current.setFilter('status', 'draft');
    });

    expect(result.current.filtered).toHaveLength(1);
    expect(result.current.filtered[0].id).toBe('2');
  });

  it('日付範囲でフィルタできる', () => {
    const { result } = renderHook(() => useEntriesFilters(entries));

    act(() => {
      result.current.setFilter('dateFrom', '2026-01-15');
      result.current.setFilter('dateTo', '2026-01-31');
    });

    expect(result.current.filtered).toHaveLength(1);
    expect(result.current.filtered[0].id).toBe('2');
  });

  it('複数フィルタの組み合わせが動作する', () => {
    const { result } = renderHook(() => useEntriesFilters(entries));

    act(() => {
      result.current.setFilter('propertyCode', 'P001');
      result.current.setFilter('status', 'ready');
    });

    expect(result.current.filtered).toHaveLength(1);
    expect(result.current.filtered[0].id).toBe('1');
  });

  it('resetFiltersで全フィルタがクリアされる', () => {
    const { result } = renderHook(() => useEntriesFilters(entries));

    act(() => {
      result.current.setFilter('propertyCode', 'P001');
      result.current.setFilter('status', 'ready');
    });

    expect(result.current.filtered).toHaveLength(1);

    act(() => {
      result.current.resetFilters();
    });

    expect(result.current.filtered).toHaveLength(3);
    expect(result.current.filters.propertyCode).toBe('');
    expect(result.current.filters.status).toBe('');
  });
});
