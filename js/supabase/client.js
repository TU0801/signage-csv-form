// supabase/client.js - Supabaseクライアント初期化

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.47.0';

export const SUPABASE_URL = window.SUPABASE_URL || 'YOUR_SUPABASE_URL';
const SUPABASE_ANON_KEY = window.SUPABASE_ANON_KEY || 'YOUR_SUPABASE_ANON_KEY';
export const STORAGE_BUCKET = 'poster-images';

/** @type {import('@supabase/supabase-js').SupabaseClient} */
// baranプロジェクトはアプリ別スキーマ構成。本アプリのテーブルはsignageスキーマに在る
export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, { db: { schema: 'signage' } });
