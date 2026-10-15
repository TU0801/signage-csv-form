import { describe, it, expect } from 'vitest';
import { sortVendors, vendorOptions } from '../vendorOptions';
import type { DbVendor } from '@/types/database';

const vendor = (id: string, vendor_name: string) => ({ id, vendor_name }) as DbVendor;

describe('vendorOptions', () => {
  it('sorts by the name without ㈱/株式会社/有限会社 and adds 選択なし only when asked', () => {
    const vendors = [
      vendor('1', '㈱ビル管理'),
      vendor('2', 'ｱｲﾁ管理'),
      vendor('3', '株式会社　えん建物管理'),
      vendor('4', 'オリエント有限会社'),
    ];
    expect(vendorOptions(vendors).map((o) => o.label)).toEqual([
      'ｱｲﾁ管理',
      '株式会社　えん建物管理',
      'オリエント有限会社',
      '㈱ビル管理',
    ]);
    expect(vendorOptions(vendors, { withNone: true })[0]).toEqual({ value: '', label: '選択なし' });
    expect(sortVendors(vendors).map((v) => v.id)).toEqual(vendorOptions(vendors).map((o) => o.value));
  });
});
