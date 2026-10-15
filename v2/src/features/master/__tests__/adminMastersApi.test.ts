import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as adminMasters from '@/lib/api/admin-masters';

const { updateInspectionType, updateInspectionSortOrder } = adminMasters;

// supabase のクエリビルダーを、呼ばれたメソッドと引数を記録するだけのものにする
const calls: { method: string; args: unknown[] }[] = [];
let result: Record<string, unknown> = { data: {}, error: null };

function builder(): Record<string, unknown> {
  const b: Record<string, unknown> = {};
  for (const m of ['insert', 'update', 'delete', 'select', 'eq', 'single']) {
    b[m] = (...args: unknown[]) => {
      calls.push({ method: m, args });
      return b;
    };
  }
  b.then = (resolve: (v: unknown) => unknown) => Promise.resolve(result).then(resolve);
  return b;
}

vi.mock('@/lib/supabase', () => ({
  supabase: {
    from: (table: string) => {
      calls.push({ method: 'from', args: [table] });
      return builder();
    },
  },
  TABLES: {
    properties: 'signage_master_properties',
    inspectionTypes: 'signage_master_inspection_types',
    categories: 'signage_master_categories',
    entries: 'signage_entries',
  },
}));

describe('lib/api/admin-masters (v1 js/supabase/admin-masters.js)', () => {
  beforeEach(() => {
    calls.length = 0;
    result = { data: {}, error: null };
  });

  // 物件の正本は業務システム（2026-10-15）。signage_master_properties へ書く関数を持たない
  it('has no function that writes signage_master_properties', () => {
    for (const name of ['addProperty', 'updateProperty', 'deleteProperty']) {
      expect(adminMasters).not.toHaveProperty(name);
    }
  });

  // v1 は category（カテゴリ名のテキスト）を書く。category_id は実DBで全件 null
  it('updateInspectionType writes the category name, not category_id', async () => {
    await updateInspectionType('id-1', {
      inspection_name: 'エレベーター点検',
      category: '点検',
      template_no: 'elevator_inspection',
      default_text: '',
      show_on_board: true,
    });
    const payload = calls.find((c) => c.method === 'update')?.args[0] as Record<string, unknown>;
    expect(payload).toEqual({
      inspection_name: 'エレベーター点検',
      category: '点検',
      template_no: 'elevator_inspection',
      default_text: '',
      show_on_board: true,
    });
    expect(payload).not.toHaveProperty('category_id');
    expect(calls).toContainEqual({ method: 'eq', args: ['id', 'id-1'] });
  });

  // v1 updateInspectionType は .select().single()。RLS で0件更新だと PGRST116 で失敗し「並び順の更新に失敗しました」になる
  it('updateInspectionSortOrder fails when no row was updated (silent RLS no-op)', async () => {
    result = { data: null, error: { code: 'PGRST116', message: 'JSON object requested, multiple (or no) rows returned' } };
    await expect(updateInspectionSortOrder('id-1', 3)).rejects.toMatchObject({ code: 'PGRST116' });
    expect(calls.find((c) => c.method === 'update')?.args[0]).toEqual({ sort_order: 3 });
    expect(calls).toContainEqual({ method: 'select', args: ['id'] });
    expect(calls).toContainEqual({ method: 'single', args: [] });
  });
});
