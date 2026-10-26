import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';

const portal = vi.hoisted(() => ({ fetchPortalInspectionUnits: vi.fn() }));
vi.mock('@/lib/api/portal', () => portal);

import { useUnitLabels } from '../hooks/useUnitLabels';

const unit = (unit_id: string, unit_sort: number) => ({
  inspection_id: 'i1',
  unit_id,
  unit_code: `No${unit_sort}`,
  unit_sort,
  maintainer_id: null,
  inspection_months: [],
  inspected_on: null,
  equipment_code: null,
});

beforeEach(() => vi.clearAllMocks());

describe('useUnitLabels（修正依頼1026 後続）', () => {
  it('読み込み済みのラベルに無い台が現れたら読み直す。同じ台の組では2回読まない', async () => {
    portal.fetchPortalInspectionUnits.mockResolvedValue([unit('u1', 1), unit('u2', 2)]);
    const { result, rerender } = renderHook(({ ids }: { ids: (string | null | undefined)[] }) => useUnitLabels(ids), {
      initialProps: { ids: [] as (string | null | undefined)[] },
    });
    // 台ごとの申請が無い間は読まない
    expect(portal.fetchPortalInspectionUnits).not.toHaveBeenCalled();
    rerender({ ids: ['u1', null] });
    await waitFor(() => expect(result.current.get('u1')).toBe('No1'));
    expect(portal.fetchPortalInspectionUnits).toHaveBeenCalledTimes(1);
    // 読み込み済みの台だけなら読み直さない
    rerender({ ids: ['u2', 'u1'] });
    expect(portal.fetchPortalInspectionUnits).toHaveBeenCalledTimes(1);
    // 後から加わった台は読み直す
    portal.fetchPortalInspectionUnits.mockResolvedValue([unit('u1', 1), unit('u2', 2), unit('u3', 3)]);
    rerender({ ids: ['u1', 'u3'] });
    await waitFor(() => expect(result.current.get('u3')).toBe('No3'));
    expect(portal.fetchPortalInspectionUnits).toHaveBeenCalledTimes(2);
    // 読んでも返らない台（範囲外など）は、同じ組では2回読まない
    rerender({ ids: ['u1', 'u9'] });
    await waitFor(() => expect(portal.fetchPortalInspectionUnits).toHaveBeenCalledTimes(3));
    rerender({ ids: ['u9', 'u1'] });
    rerender({ ids: ['u1', 'u9'] });
    await new Promise((r) => setTimeout(r, 20));
    expect(portal.fetchPortalInspectionUnits).toHaveBeenCalledTimes(3);
    expect(result.current.get('u3')).toBe('No3');
  });
});
