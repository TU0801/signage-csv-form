// supabase/admin-masters.js - マスターデータ管理（CRUD）

import { supabase } from './client.js';

// 物件
//
// **物件（signage_master_properties）は書かない（2026-10-15）。** 物件の正本は業務システム
// （biz.properties）で、追加・コード・名前・端末は biz のトリガー（biz.sync_property_to_signage）が
// 写す。この画面から保存するのは点検情報（saveInspectionsToBiz）と台ごとの保守の RPC だけ。

// 保守会社
//
// **追加・編集・削除はしない（2026-09-29）。** 保守会社は業務システムの取引先に統合され、
// biz.maintainers からトリガーで signage_master_vendors に写る。こちらからの直接書き込みは DB が拒否する。

// 点検種別
export async function addInspectionType(inspectionType) {
  const { data, error } = await supabase.from('signage_master_inspection_types').insert(inspectionType).select().single();
  if (error) throw error;
  return data;
}

export async function updateInspectionType(id, inspectionType) {
  const { data, error } = await supabase.from('signage_master_inspection_types').update(inspectionType).eq('id', id).select().single();
  if (error) throw error;
  return data;
}

export async function deleteInspectionType(id) {
  const { error } = await supabase.from('signage_master_inspection_types').delete().eq('id', id);
  if (error) throw error;
}

// カテゴリ
export async function addCategory(categoryData) {
  const { data, error } = await supabase.from('signage_master_categories').insert(categoryData).select().single();
  if (error) throw error;
  return data;
}

export async function updateCategory(id, categoryData) {
  const { data, error } = await supabase.from('signage_master_categories').update(categoryData).eq('id', id).select().single();
  if (error) throw error;
  return data;
}

export async function deleteCategory(id) {
  const { error } = await supabase.from('signage_master_categories').delete().eq('id', id);
  if (error) throw error;
}

// テンプレート画像
//
// **追加・編集・削除はしない（2026-09-29）。** 正本は業務システムの biz.template_images で、
// 編集は業務システムの設定（テンプレート画像）で行う。読み取りは master-data.js の getMasterTemplateImages()。
