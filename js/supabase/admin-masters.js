// supabase/admin-masters.js - マスターデータ管理（CRUD）

import { supabase } from './client.js';

// 物件
export async function addProperty(property) {
  const record = { property_code: property.property_code, property_name: property.property_name, terminals: property.terminals };
  const { data, error } = await supabase.from('signage_master_properties').insert(record).select().single();
  if (error) throw error;
  return data;
}

export async function updateProperty(id, property) {
  const record = { property_code: property.property_code, property_name: property.property_name, terminals: property.terminals };
  const { data, error } = await supabase.from('signage_master_properties').update(record).eq('id', id).select().single();
  if (error) throw error;
  return data;
}

export async function deleteProperty(id) {
  const { error } = await supabase.from('signage_master_properties').delete().eq('id', id);
  if (error) throw error;
}

// 保守会社
export async function addVendor(vendor) {
  const { data, error } = await supabase.from('signage_master_vendors').insert(vendor).select().single();
  if (error) throw error;
  return data;
}

export async function updateVendor(id, vendor) {
  const { data, error } = await supabase.from('signage_master_vendors').update(vendor).eq('id', id).select().single();
  if (error) throw error;
  return data;
}

export async function deleteVendor(id) {
  const { error } = await supabase.from('signage_master_vendors').delete().eq('id', id);
  if (error) throw error;
}

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
export async function addTemplateImage(templateImage) {
  const { data, error } = await supabase.from('signage_master_template_images').insert(templateImage).select().single();
  if (error) throw error;
  return data;
}

export async function updateTemplateImage(id, templateImage) {
  const { data, error } = await supabase.from('signage_master_template_images').update(templateImage).eq('id', id).select().single();
  if (error) throw error;
  return data;
}

export async function deleteTemplateImage(id) {
  const { error } = await supabase.from('signage_master_template_images').delete().eq('id', id);
  if (error) throw error;
}
