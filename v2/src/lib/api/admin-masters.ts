import { supabase, TABLES } from '@/lib/supabase';
import type { DbInspectionType, DbCategory } from '@/types/database';

// ========================================
// マスター管理（物件・点検種別・カテゴリ）の書き込み。
// 列は実DB（information_schema.columns、2026-10-15）と v1 の送る列に合わせ、オブジェクトリテラルで明示する
// （check:schema が表名と列を静的に照合できるように、表名を変数で渡さない）。
// 保守会社（block_vendor_direct_write）とテンプレート画像（block_template_images_write）は書き込まない。
// ========================================

// **物件（signage_master_properties）は書かない（2026-10-15）。** 物件の正本は業務システム（biz.properties）で、
// 追加・コード・名前・端末は biz のトリガー（biz.sync_property_to_signage）が写す。
// 物件モーダルから保存するのは点検情報と台ごとの保守の RPC だけ（lib/api/inspections）。

/**
 * 点検種別の保存で送る列（v1 と同じ5列）。カテゴリは category（カテゴリ名のテキスト）に入れる。
 * category_id は実DBで 170 件すべて null で、v1 は書かない。
 */
export interface InspectionTypeInput {
  inspection_name: string;
  category: string;
  template_no: string;
  default_text: string;
  show_on_board: boolean;
}

// v1: js/supabase/admin-masters.js addInspectionType
export async function addInspectionType(t: InspectionTypeInput): Promise<DbInspectionType> {
  const { data, error } = await supabase
    .from(TABLES.inspectionTypes)
    .insert({
      inspection_name: t.inspection_name,
      category: t.category,
      template_no: t.template_no,
      default_text: t.default_text,
      show_on_board: t.show_on_board,
    })
    .select()
    .single();
  if (error) throw error;
  return data as DbInspectionType;
}

// v1: js/supabase/admin-masters.js updateInspectionType
export async function updateInspectionType(
  id: string,
  t: InspectionTypeInput,
): Promise<DbInspectionType> {
  const { data, error } = await supabase
    .from(TABLES.inspectionTypes)
    .update({
      inspection_name: t.inspection_name,
      category: t.category,
      template_no: t.template_no,
      default_text: t.default_text,
      show_on_board: t.show_on_board,
    })
    .eq('id', id)
    .select()
    .single();
  if (error) throw error;
  return data as DbInspectionType;
}

/** 並べ替え（ドラッグ&ドロップ）で sort_order だけを書く */
// v1: js/admin-masters.js updateInspectionSortOrders（updateInspectionType(id, { sort_order }) の呼び出し）
export async function updateInspectionSortOrder(id: string, sortOrder: number): Promise<void> {
  const { error } = await supabase
    .from(TABLES.inspectionTypes)
    .update({ sort_order: sortOrder })
    .eq('id', id)
    // v1 と同じく更新後の行を1件求める。RLS で0件更新（エラーにならない空振り）だと single() が PGRST116 で失敗する
    .select('id')
    .single();
  if (error) throw error;
}

// v1: js/supabase/admin-masters.js deleteInspectionType
export async function deleteInspectionType(id: string): Promise<void> {
  const { error } = await supabase.from(TABLES.inspectionTypes).delete().eq('id', id);
  if (error) throw error;
}

export interface CategoryInput {
  category_name: string;
  sort_order: number;
}

// v1: js/supabase/admin-masters.js addCategory
export async function addCategory(c: CategoryInput): Promise<DbCategory> {
  const { data, error } = await supabase
    .from(TABLES.categories)
    .insert({ category_name: c.category_name, sort_order: c.sort_order })
    .select()
    .single();
  if (error) throw error;
  return data as DbCategory;
}

// v1: js/supabase/admin-masters.js updateCategory
export async function updateCategory(id: string, c: CategoryInput): Promise<DbCategory> {
  const { data, error } = await supabase
    .from(TABLES.categories)
    .update({ category_name: c.category_name, sort_order: c.sort_order })
    .eq('id', id)
    .select()
    .single();
  if (error) throw error;
  return data as DbCategory;
}

// v1: js/supabase/admin-masters.js deleteCategory
export async function deleteCategory(id: string): Promise<void> {
  const { error } = await supabase.from(TABLES.categories).delete().eq('id', id);
  if (error) throw error;
}

/**
 * 点検種別を使っているエントリーの件数（削除の前の確認）。
 * v1 は画面に読み込んだ全エントリーを数えていた。ここは件数だけを DB に問い合わせる（結果は同じ）。
 */
// v1: js/admin-masters.js deleteMasterInspectionAction（entries.filter(e => e.inspection_type === name)）
export async function countEntriesByInspectionName(inspectionName: string): Promise<number> {
  const { count, error } = await supabase
    .from(TABLES.entries)
    .select('id', { count: 'exact', head: true })
    .eq('inspection_type', inspectionName);
  if (error) throw error;
  return count ?? 0;
}
