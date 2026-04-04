// supabase/equipment.js - 建物設備管理

import { supabase } from './client.js';

export async function getBuildingEquipment(propertyCode) {
  const { data, error } = await supabase
    .from('signage_building_equipment')
    .select('*')
    .eq('property_code', propertyCode)
    .order('created_at');
  if (error) throw error;
  return data || [];
}

export async function addBuildingEquipment(equipment) {
  const { data, error } = await supabase
    .from('signage_building_equipment')
    .insert(equipment)
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function deleteBuildingEquipment(id) {
  const { error } = await supabase
    .from('signage_building_equipment')
    .delete()
    .eq('id', id);
  if (error) throw error;
}
