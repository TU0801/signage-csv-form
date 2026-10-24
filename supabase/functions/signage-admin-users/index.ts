// signage-admin-users - 管理者によるユーザー作成・パスワード変更（service_role が必要な操作）
// 管理会社のアカウント（修正依頼1024 C3）も、自社の範囲だけ使える:
//   - 作成: 自社の管理会社ユーザーだけ（会社は呼び出し元の会社に固定）。管理者・保守会社（権限 user）のアカウントは作れない
//     （保守会社のアカウントは全管理会社分の点検・報告書を見られる。管理会社は自社物件への保守会社の紐付けを自分で書けるので、
//       保守会社アカウントの作成を開くと、任意の保守会社のアカウントを作って他社のデータに入れてしまう）
//   - パスワード変更・有効化／無効化（set_status）: 自社の管理会社ユーザーだけ
//   範囲はここで service_role として確かめる（scripts/fix-1024-mgmt.sql）
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

// service_role での書き込みは監査トリガーが操作者を記録できない（auth.uid() が NULL）ため、操作した管理者をここで残す
async function writeAudit(
  // deno-lint-ignore no-explicit-any
  admin: any,
  actorId: string,
  operation: string,
  targetId: string,
  data: Record<string, unknown>,
  tableName = 'auth.users',
) {
  const { error } = await admin.from('signage_audit_logs').insert({
    table_name: tableName,
    operation,
    record_id: targetId,
    user_id: actorId,
    new_data: data,
  });
  if (error) console.error('audit log insert failed:', error.message);
}

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
    .from('signage_profiles').select('role, status, management_company_id').eq('id', caller.id).maybeSingle();
  const callerIsAdmin = callerProfile?.role === 'admin' && callerProfile.status === 'active';
  // 管理会社: 会社が付いた有効なアカウントだけ。以降の操作は callerCompanyId の範囲に限る
  const callerCompanyId: string | null =
    callerProfile?.role === 'management' && callerProfile.status === 'active' && callerProfile.management_company_id
      ? callerProfile.management_company_id
      : null;
  if (!callerIsAdmin && !callerCompanyId) {
    return json({ error: '管理者権限が必要です' }, 403);
  }

  /** 管理会社の呼び出し元が扱える相手か（自社の管理会社ユーザーだけ） */
  // deno-lint-ignore no-explicit-any
  const inManagementScope = (target: any) =>
    !!target && target.role === 'management' && target.management_company_id === callerCompanyId;

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return json({ error: 'リクエストが不正です' }, 400);
  }

  const password = typeof body.password === 'string' ? body.password : '';
  const passwordError = password.length < MIN_PASSWORD_LENGTH
    ? json({ error: `パスワードは${MIN_PASSWORD_LENGTH}文字以上で入力してください` }, 400)
    : null;

  if (body.action === 'create_user') {
    const email = typeof body.email === 'string' ? body.email.trim() : '';
    const role = body.role === 'admin' || body.role === 'user' || body.role === 'management' ? body.role : null;
    // 管理会社アカウントは保守会社を持たない（申請の作成を開かせない）。管理会社の会社は management のときだけ受け取る
    const vendorId = role !== 'management' && typeof body.vendorId === 'string' && body.vendorId ? body.vendorId : null;
    const managementCompanyId = role === 'management' && typeof body.managementCompanyId === 'string' && body.managementCompanyId
      ? body.managementCompanyId
      : null;
    if (!email || !role) return json({ error: 'メールアドレスと権限を指定してください' }, 400);
    if (passwordError) return passwordError;
    let finalManagementCompanyId = managementCompanyId;
    if (!callerIsAdmin) {
      // 管理会社: 作れるのは自社の管理会社ユーザーだけ（会社は自社に固定）。管理者・保守会社のアカウントは管理者が作る
      if (role === 'admin') return json({ error: '管理者のアカウントは作成できません' }, 403);
      if (role === 'user') return json({ error: '保守会社のアカウントは管理者が作成します' }, 403);
      // 将来 role が増えても管理会社が作れるのは management だけ（保守会社は持たせない）
      if (role !== 'management' || vendorId) return json({ error: '管理会社のアカウントだけ作成できます' }, 403);
      finalManagementCompanyId = callerCompanyId;
    }
    if (role === 'management' && !finalManagementCompanyId) return json({ error: '管理会社を選択してください' }, 400);
    if (vendorId) {
      const { data: vendor } = await admin.from('signage_master_vendors').select('id').eq('id', vendorId).maybeSingle();
      if (!vendor) return json({ error: '保守会社が見つかりません' }, 400);
    }
    if (finalManagementCompanyId) {
      // 管理会社は業務システム（biz.companies）の会社。管理会社の印が無い会社を選ばせない（外部キーだけでは区別できない）
      const { data: company, error: companyError } = await admin.schema('biz')
        .from('companies').select('id').eq('id', finalManagementCompanyId).eq('is_management_company', true).maybeSingle();
      if (companyError) return json({ error: `管理会社の確認に失敗しました: ${companyError.message}` }, 500);
      if (!company) return json({ error: '管理会社が見つかりません' }, 400);
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

    // management_company_id は管理会社のときだけ送る（列を足す DDL の前に配備しても、従来の作成が通るように）
    const profileRow: Record<string, unknown> = { id: created.user.id, email: created.user.email, role, vendor_id: vendorId, status: 'active' };
    if (role === 'management') profileRow.management_company_id = finalManagementCompanyId;
    const { data: profile, error: profileError } = await admin
      .from('signage_profiles')
      .upsert(profileRow, { onConflict: 'id' })
      .select()
      .single();
    if (profileError) {
      // プロファイルの無いログイン可能なユーザーを残さない（直前に作ったユーザーなので削除して安全）
      const { error: rollbackError } = await admin.auth.admin.deleteUser(created.user.id);
      const rollbackNote = rollbackError
        ? `（作成したログインアカウント ${created.user.email} の取り消しにも失敗しました: ${rollbackError.message}）`
        : '';
      return json({ error: `プロファイル作成に失敗しました: ${profileError.message}${rollbackNote}` }, 500);
    }
    await writeAudit(admin, caller.id, 'CREATE_USER', created.user.id, {
      email: created.user.email,
      role,
      vendor_id: vendorId,
      management_company_id: finalManagementCompanyId,
    });
    return json({ user: profile });
  }

  if (body.action === 'set_password') {
    const userId = typeof body.userId === 'string' ? body.userId : '';
    // baran プロジェクトの auth.users は他アプリと共用のため、signage のユーザーに限定する
    const { data: target } = await admin
      .from('signage_profiles').select('id, email, role, management_company_id').eq('id', userId).maybeSingle();
    // 管理会社には範囲外のユーザーを「見つからない」と返す（他社のアカウントの有無を知らせない）
    if (!target || (!callerIsAdmin && !inManagementScope(target))) return json({ error: 'ユーザーが見つかりません' }, 404);
    // 他アプリ（noj/mansion/biz）でも使われているアカウントは、変更が他アプリのログインにも及ぶため拒否する
    const { data: shared, error: sharedError } = await admin.rpc('is_shared_auth_user', { target: userId });
    if (sharedError) return json({ error: `共用アカウントの確認に失敗しました: ${sharedError.message}` }, 500);
    if (shared) {
      return json({ error: 'このアカウントは他のシステムと共用のため、ここではパスワードを変更できません' }, 409);
    }
    // 対象の確認はパスワード長の検証より先に行う（短いパスワードで共用判定を試しても変更が起こり得ないようにするため）
    if (passwordError) return passwordError;

    const { error } = await admin.auth.admin.updateUserById(userId, { password });
    if (error) return json({ error: `パスワード変更に失敗しました: ${error.message}` }, 400);
    await writeAudit(admin, caller.id, 'SET_PASSWORD', userId, { email: target.email });
    return json({ ok: true });
  }

  if (body.action === 'set_status') {
    // 有効化・無効化（管理会社の画面から。profiles の状態の列はトリガーが管理者以外の更新を断るので service_role で書く）
    const userId = typeof body.userId === 'string' ? body.userId : '';
    const status = body.status === 'active' || body.status === 'inactive' ? body.status : null;
    if (!status) return json({ error: '状態を指定してください' }, 400);
    if (userId === caller.id) return json({ error: '自分の状態は変更できません' }, 400);
    const { data: target } = await admin
      .from('signage_profiles').select('id, email, role, management_company_id').eq('id', userId).maybeSingle();
    if (!target || (!callerIsAdmin && !inManagementScope(target))) return json({ error: 'ユーザーが見つかりません' }, 404);
    const { error } = await admin.from('signage_profiles').update({ status }).eq('id', userId);
    if (error) return json({ error: `状態の変更に失敗しました: ${error.message}` }, 400);
    await writeAudit(admin, caller.id, 'SET_STATUS', userId, { email: target.email, status }, 'signage_profiles');
    return json({ ok: true });
  }

  return json({ error: '不明な操作です' }, 400);
});
