import { describe, it, expect } from 'vitest';
import {
  buildTemplateOptions,
  moveItem,
  resolveTemplateKey,
  sortOrderUpdates,
  templateLabel,
} from '../lib/inspectionTypes';

describe('inspection type helpers (v1 js/admin-masters.js)', () => {
  it('templateLabel uses the v1 fixed label table, the raw key, or 未設定', () => {
    expect(templateLabel('elevator_inspection')).toBe('エレベーター点検');
    expect(templateLabel('unknown_key')).toBe('unknown_key');
    expect(templateLabel('')).toBe('未設定');
  });

  it('resolveTemplateKey strips a date prefix by matching the key suffix', () => {
    const keys = ['cleaning', 'elevator_inspection'];
    expect(resolveTemplateKey('1124 235959cleaning', keys)).toBe('cleaning');
    expect(resolveTemplateKey('elevator_inspection', keys)).toBe('elevator_inspection');
    expect(resolveTemplateKey('other', keys)).toBe('other');
  });

  it('buildTemplateOptions groups biz template images by category, falling back to the fixed table', () => {
    const groups = buildTemplateOptions([
      { id: '1', image_key: 'a', display_name: 'A', image_url: 'https://x/a.png', category: '点検', sort_order: 1 },
      { id: '2', image_key: 'b', display_name: 'B', image_url: 'https://x/b.png', category: null, sort_order: 2 },
    ]);
    expect(groups.map((g) => g.label)).toEqual(['点検', '未分類']);
    expect(groups[0]?.options[0]).toEqual({ value: 'a', label: 'A', imageUrl: 'https://x/a.png' });
    expect(buildTemplateOptions([])[0]?.options.length).toBe(62);
  });

  // v1 handleInspectionDrop: 下へ動かすと落とした行の後ろ、上へ動かすと前
  it('moveItem places the dragged row after a lower target and before a higher one', () => {
    expect(moveItem(['A', 'B', 'C', 'D'], 'A', 'C')).toEqual(['B', 'C', 'A', 'D']);
    expect(moveItem(['A', 'B', 'C', 'D'], 'D', 'B')).toEqual(['A', 'D', 'B', 'C']);
  });

  it('sortOrderUpdates renumbers from 0 and returns only rows whose sort_order changes', () => {
    const items = [
      { id: 'A', sort_order: 0 },
      { id: 'B', sort_order: 1 },
      { id: 'C', sort_order: 2 },
    ];
    expect(sortOrderUpdates(['A', 'C', 'B'], items)).toEqual([
      { id: 'C', sort_order: 1 },
      { id: 'B', sort_order: 2 },
    ]);
  });
});
