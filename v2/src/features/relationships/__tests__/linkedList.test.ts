import { describe, it, expect } from 'vitest';
import type { DbBuildingVendor } from '@/types/database';
import type { VendorInspectionWithType } from '../api';
import {
  confirmNameList,
  filterBuildingLinks,
  sortBuildingLinks,
  sortInspectionLinks,
} from '../lib/linkedList';

const link = (property_code: string) => ({ property_code }) as DbBuildingVendor;
const vi = (inspection_name: string, sort_order: number | null) =>
  ({
    id: inspection_name,
    signage_master_inspection_types: { inspection_name, category: '点検', sort_order },
  }) as VendorInspectionWithType;

// 紐付け済みの表は取得が登録日順なので、表示はコード順（点検種別はマスターの並び順）に並べ直す
describe('linked list helpers', () => {
  it('sorts properties by code (numbers as numbers) and searches code and name ignoring kana/width', () => {
    const rels = [link('z0023A01'), link('120411-00'), link('9000-00')];
    expect(sortBuildingLinks(rels).map((r) => r.property_code)).toEqual(['9000-00', '120411-00', 'z0023A01']);
    const names = new Map([['9000-00', 'グランマンション']]);
    expect(filterBuildingLinks(rels, (c) => names.get(c), 'まんしょん').map((r) => r.property_code)).toEqual([
      '9000-00',
    ]);
  });

  it('sorts inspection types by sort_order with unset last, then by name', () => {
    expect(sortInspectionLinks([vi('C', null), vi('B', 2), vi('A', 2), vi('D', 1)]).map((r) => r.id)).toEqual([
      'D',
      'A',
      'B',
      'C',
    ]);
  });

  it('confirmNameList lists up to max names and counts the rest', () => {
    expect(confirmNameList(['a', 'b', 'c'], 2)).toBe('・a\n・b\n…ほか 1 件');
  });
});
