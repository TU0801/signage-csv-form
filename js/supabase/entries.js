// supabase/entries.js - 点検データCRUD + 管理者用全データ取得

import { supabase } from './client.js';
import { getUser } from './auth.js';

export async function getEntries() {
  const { data, error } = await supabase
    .from('signage_entries')
    .select('*')
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data;
}

export async function getUserEntriesCurrentMonth() {
  const user = await getUser();
  if (!user) return [];
  const now = new Date();
  const firstOfMonth = new Date(now.getFullYear(), now.getMonth(), 1)
    .toISOString().split('T')[0];
  const { data, error } = await supabase
    .from('signage_entries')
    .select('*')
    .eq('user_id', user.id)
    .gte('created_at', firstOfMonth)
    .order('created_at', { ascending: false });
  if (error) { console.error('Error fetching user entries:', error); return []; }
  return data || [];
}

export async function createEntry(entry) {
  const user = await getUser();
  if (!user) throw new Error('ログインが必要です');
  const { data, error } = await supabase
    .from('signage_entries')
    .insert({ ...entry, user_id: user.id })
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function createEntries(entries) {
  const user = await getUser();
  if (!user) throw new Error('ログインが必要です');
  const entriesWithUser = entries.map(e => ({ ...e, user_id: user.id }));
  const { data, error } = await supabase
    .from('signage_entries')
    .insert(entriesWithUser)
    .select();
  if (error) throw error;
  return data;
}

export async function updateEntry(id, entry) {
  const { data, error } = await supabase
    .from('signage_entries')
    .update(entry)
    .eq('id', id)
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function deleteEntry(id) {
  const { error } = await supabase
    .from('signage_entries')
    .delete()
    .eq('id', id);
  if (error) throw error;
}

export async function getAllEntries(filters = {}) {
  let query = supabase
    .from('signage_entries')
    .select('*')
    .order('created_at', { ascending: false });
  if (filters.propertyCode) query = query.eq('property_code', filters.propertyCode);
  if (filters.startDate) query = query.gte('inspection_start', filters.startDate);
  if (filters.endDate) query = query.lte('inspection_start', filters.endDate);
  if (filters.status) query = query.eq('status', filters.status);
  if (filters.statusArray && filters.statusArray.length > 0) query = query.in('status', filters.statusArray);
  if (filters.vendorName) query = query.eq('vendor_name', filters.vendorName);
  const { data, error } = await query;
  if (error) throw error;
  return data;
}

export async function updateEntriesStatusBulk(ids, status) {
  const { data, error } = await supabase
    .from('signage_entries')
    .update({ status })
    .in('id', ids)
    .select();
  if (error) throw error;
  return data;
}
