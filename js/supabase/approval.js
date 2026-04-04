// supabase/approval.js - 承認ワークフロー

import { supabase } from './client.js';

export async function getPendingEntries() {
  const { data, error } = await supabase.from('signage_entries').select('*').eq('status', 'draft').order('created_at', { ascending: false });
  if (error) throw error;
  return data;
}

export async function approveEntry(id) {
  const { data, error } = await supabase.from('signage_entries').update({ status: 'ready' }).eq('id', id).select().single();
  if (error) throw error;
  return data;
}

export async function approveEntries(ids) {
  const { data, error } = await supabase.from('signage_entries').update({ status: 'ready' }).in('id', ids).select();
  if (error) throw error;
  return data;
}

export async function rejectEntry(id, reason = '') {
  const { error } = await supabase.from('signage_entries').delete().eq('id', id);
  if (error) throw error;
  return { id, reason };
}

export async function submitEntry(id) {
  const { data, error } = await supabase.from('signage_entries').update({ status: 'draft' }).eq('id', id).select().single();
  if (error) throw error;
  return data;
}

export async function submitEntries(ids) {
  const { data, error } = await supabase.from('signage_entries').update({ status: 'draft' }).in('id', ids).select();
  if (error) throw error;
  return data;
}

export async function revertToPending(id) {
  const { data, error } = await supabase.from('signage_entries').update({ status: 'pending' }).eq('id', id).select().single();
  if (error) throw error;
  return data;
}
