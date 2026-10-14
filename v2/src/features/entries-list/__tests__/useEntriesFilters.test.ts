import { describe, it, expect, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import {
  applyDefaultStartDate,
  getSessionFiltersForTest,
  resetSessionFiltersForTest,
  todayForFilter,
  useEntriesFilters,
} from '../hooks/useEntriesFilters';

beforeEach(() => resetSessionFiltersForTest());

describe('entries filters default (v1 admin.js loadAllData / restoreFilters)', () => {
  it('opens with start date = today (UTC date part, like v1) and the rest empty', () => {
    const { result } = renderHook(() => useEntriesFilters());
    expect(result.current.filters).toEqual({
      propertyCode: '',
      startDate: todayForFilter(),
      endDate: '',
      vendorName: '',
    });
    // v1 と同じ式なので JST 0〜9時は前日になる（JST 2026-10-15 08:00 = UTC 10-14 23:00）
    expect(todayForFilter(new Date('2026-10-15T08:00:00+09:00'))).toBe('2026-10-14');
  });

  it('keeps a cleared start date across remounts, and refills it only after approve/reject', () => {
    const first = renderHook(() => useEntriesFilters());
    act(() => first.result.current.updateFilter('startDate', ''));
    first.unmount();

    const again = renderHook(() => useEntriesFilters());
    expect(again.result.current.filters.startDate).toBe('');
    again.unmount();

    applyDefaultStartDate(new Date('2026-10-15T12:00:00+09:00'));
    expect(getSessionFiltersForTest()?.startDate).toBe('2026-10-15');
    applyDefaultStartDate(new Date('2026-12-01T12:00:00+09:00'));
    expect(getSessionFiltersForTest()?.startDate).toBe('2026-10-15');
  });
});
