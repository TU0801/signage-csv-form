// signage-admin-users - 管理者によるユーザー作成・パスワード変更（service_role が必要な操作）
//
// ブラウザの anon クライアントでは他人のパスワードを変更できず、ユーザー作成も signUp で
// 管理者のセッションが新ユーザーに一時的に切り替わっていたため、管理者検証付きでここに集約する。
// デプロイ: supabase functions deploy signage-admin-users --project-ref pdouwmjyswswfmzpfjzf --use-api --no-verify-jwt
//   （JWT はゲートウェイではなく下の getUser で検証する）

import { createClient } from 'npm:@supabase/supabase-js@2.47.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const MIN_PASSWORD_LENGTH = 6;

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'POST のみ対応しています' }, 405);

  const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
    auth: { persistSession: false, autoRefreshToken: false },
    db: { schema: 'signage' },
  });

  const token = (req.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '');
  const { data: { user: caller } } = token ? await admin.auth.getUser(token) : { data: { user: null } };
  if (!caller) return json({ error: 'ログインが必要です' }, 401);

  const { data: callerProfile } = await admin
    .from('signage_profiles').select('role, status').eq('id', caller.id).maybeSingle();
  if (callerProfile?.role !== 'admin' || callerProfile.status !== 'active') {
    return json({ error: '管理者権限が必要です' }, 403);
  }

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return json({ error: 'リクエストが不正です' }, 400);
  }

  const password = typeof body.password === 'string' ? body.password : '';
  if (password.length < MIN_PASSWORD_LENGTH) {
    return json({ error: `パスワードは${MIN_PASSWORD_LENGTH}文字以上で入力してください` }, 400);
  }

  if (body.action === 'create_user') {
    const email = typeof body.email === 'string' ? body.email.trim() : '';
    const role = body.role === 'admin' ? 'admin' : body.role === 'user' ? 'user' : null;
    const vendorId = typeof body.vendorId === 'string' && body.vendorId ? body.vendorId : null;
    if (!email || !role) return json({ error: 'メールアドレスと権限を指定してください' }, 400);
    if (vendorId) {
      const { data: vendor } = await admin.from('signage_master_vendors').select('id').eq('id', vendorId).maybeSingle();
      if (!vendor) return json({ error: '保守会社が見つかりません' }, 400);
    }

    const { data: created, error: createError } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { role },
    });
    if (createError || !created.user) {
      const already = /already|registered|exists/i.test(createError?.message || '');
      return json(
        { error: already ? 'このメールアドレスは既に登録されています' : `ユーザー作成に失敗しました: ${createError?.message}` },
        already ? 409 : 400,
      );
    }

    const { data: profile, error: profileError } = await admin
      .from('signage_profiles')
      .upsert({ id: created.user.id, email: created.user.email, role, vendor_id: vendorId, status: 'active' }, { onConflict: 'id' })
      .select()
      .single();
    if (profileError) {
      // プロファイルの無いログイン可能なユーザーを残さない（直前に作ったユーザーなので削除して安全）
      await admin.auth.admin.deleteUser(created.user.id);
      return json({ error: `プロファイル作成に失敗しました: ${profileError.message}` }, 500);
    }
    return json({ user: profile });
  }

  if (body.action === 'set_password') {
    const userId = typeof body.userId === 'string' ? body.userId : '';
    // baran プロジェクトの auth.users は他アプリと共用のため、signage のユーザーに限定する
    const { data: target } = await admin.from('signage_profiles').select('id').eq('id', userId).maybeSingle();
    if (!target) return json({ error: 'ユーザーが見つかりません' }, 404);

    const { error } = await admin.auth.admin.updateUserById(userId, { password });
    if (error) return json({ error: `パスワード変更に失敗しました: ${error.message}` }, 400);
    return json({ ok: true });
  }

  return json({ error: '不明な操作です' }, 400);
});
