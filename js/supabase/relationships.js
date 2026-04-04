// supabase/relationships.js - Building-Vendor / Vendor-Inspection 紐付け

import { supabase } from './client.js';
import { getUser, getProfile } from './auth.js';
import { getMasterProperties } from './master-data.js';

// ========================================
// Building-Vendor Relationships
// ========================================

export async function getAssignedBuildings() {
  const profile = await getProfile();
  if (!profile) throw new Error('ログインが必要です');
  if (profile.role === 'admin') return await getMasterProperties();
  if (!profile.vendor_id) return [];

  const { data: relationships, error: relError } = await supabase
    .from('building_vendors')
    .select('property_code')
    .eq('vendor_id', profile.vendor_id)
    .eq('status', 'active');
  if (relError) throw relError;
  if (!relationships || relationships.length === 0) return [];

  const propertyCodes = relationships.map(r => r.property_code);
  const { data: properties, error: propError } = await supabase
    .from('signage_master_properties')
    .select('*')
    .in('property_code', propertyCodes);
  if (propError) throw propError;
  return properties || [];
}

export async function getBuildingsByVendor(vendorId) {
  const { data: relationships, error: relError } = await supabase
    .from('building_vendors')
    .select('property_code')
    .eq('vendor_id', vendorId)
    .eq('status', 'active');
  if (relError) throw relError;
  if (!relationships || relationships.length === 0) return [];

  const propertyCodes = relationships.map(r => r.property_code);
  const { data: properties, error: propError } = await supabase
    .from('signage_master_properties')
    .select('*')
    .in('property_code', propertyCodes);
  if (propError) throw propError;
  return properties || [];
}

export async function getBuildingVendors(filters = {}) {
  let query = supabase
    .from('building_vendors')
    .select('*, signage_master_vendors(vendor_name, inspection_type)')
    .order('created_at', { ascending: false });
  if (filters.vendorId) query = query.eq('vendor_id', filters.vendorId);
  if (filters.status) query = query.eq('status', filters.status);
  const { data, error } = await query;
  if (error) throw error;
  return data;
}

export async function getPendingBuildingRequests() {
  const { data, error } = await supabase
    .from('building_vendors')
    .select('*, signage_master_vendors(vendor_name)')
    .eq('status', 'pending')
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data;
}

export async function addBuildingVendor(propertyCode, vendorId = null) {
  const profile = await getProfile();
  if (!profile) throw new Error('ログインが必要です');
  const user = await getUser();
  const isAdminUser = profile.role === 'admin';
  const finalVendorId = vendorId || profile.vendor_id;
  if (!finalVendorId) throw new Error('ベンダーIDが設定されていません');

  const { data, error } = await supabase
    .from('building_vendors')
    .upsert({
      property_code: propertyCode,
      vendor_id: finalVendorId,
      status: isAdminUser ? 'active' : 'pending',
      requested_by: user.id,
      approved_by: isAdminUser ? user.id : null,
      updated_at: new Date().toISOString()
    }, { onConflict: 'property_code,vendor_id' })
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function approveBuildingRequest(buildingVendorId) {
  const user = await getUser();
  const { data, error } = await supabase
    .from('building_vendors')
    .update({ status: 'active', approved_by: user.id })
    .eq('id', buildingVendorId)
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function rejectBuildingRequest(buildingVendorId) {
  const { error } = await supabase
    .from('building_vendors')
    .delete()
    .eq('id', buildingVendorId);
  if (error) throw error;
}

export async function removeBuildingVendor(buildingVendorId) {
  const { data, error } = await supabase
    .from('building_vendors')
    .update({ status: 'deleted' })
    .eq('id', buildingVendorId)
    .select()
    .single();
  if (error) throw error;
  return data;
}

// ========================================
// Vendor-Inspection Relationships
// ========================================

export async function getVendorInspections(vendorId) {
  const { data, error } = await supabase
    .from('signage_vendor_inspections')
    .select('*, signage_master_inspection_types(inspection_name, category)')
    .eq('vendor_id', vendorId)
    .eq('status', 'active')
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data;
}

export async function addVendorInspection(vendorId, inspectionId) {
  const { data, error } = await supabase
    .from('signage_vendor_inspections')
    .insert({ vendor_id: vendorId, inspection_id: inspectionId, status: 'active' })
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function removeVendorInspection(relationshipId) {
  const { data, error } = await supabase
    .from('signage_vendor_inspections')
    .update({ status: 'inactive' })
    .eq('id', relationshipId)
    .select()
    .single();
  if (error) throw error;
  return data;
}
