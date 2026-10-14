// check-schema.mjs 自体の確認用（tsconfig の対象外。アプリからは読まない）
// node scripts/check-schema.mjs --src scripts/fixtures/check-schema で、各「NG」行が報告されることを見る
/* eslint-disable */
declare const supabase: any;

export const TABLES = {
  entries: 'signage_entries',
  buildingVendors: 'building_vendors', // NG: 表なし（改名前の名前）
} as const;
export const RPC = { inspectionsAll: 'inspections_all', missing: 'no_such_function' } as const;

export async function samples(id: string) {
  await supabase.from(TABLES.buildingVendors).select('*'); // NG 表なし
  await supabase.from(TABLES.entries).select('id, no_such_col, vendor:vendor_name').eq('nope_col', id); // NG 2列
  await supabase.from(TABLES.entries).update({ status: 'ready', bogus: 1 }).eq('id', id); // NG bogus
  await supabase.from(TABLES.nothing).select('*'); // NG TABLES に無い
  let query = supabase.from(TABLES.entries).select('*');
  query = query.eq('also_missing', id); // NG（変数経由）
  await supabase.rpc(RPC.missing); // NG 関数なし
  await supabase.rpc(RPC.inspectionsAll, { p_bad: 1 }); // NG 引数名
  await supabase.rpc('inspections_for_property', { property_code: 'x' }); // NG 引数名（RETURNS TABLE の列名。正しくは p_property_code）
  await supabase.rpc('inspections_for_property', { p_property_code: 'x' }); // OK
  await supabase.schema('biz').from('inspection_types').select('id, label, nope'); // NG nope
  await supabase.storage.from('no-such-bucket').upload('x', new Blob()); // NG バケットなし
  await supabase.functions.invoke('no-such-function'); // NG Edge Function なし
  Array.from({ length: 3 }); // 対象外
  await supabase.from(TABLES.entries).select('id, inspection_co').order('inspection_co'); // OK
}
