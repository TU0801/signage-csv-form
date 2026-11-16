// signage-admin-users - 管理者によるユーザー作成・パスワード変更（service_role が必要な操作）
// 管理会社のアカウント（修正依頼1024 C3）も、自社の範囲だけ使える:
//   - 作成: 自社の管理会社ユーザーだけ（会社は呼び出し元の会社に固定）。管理者・保守会社（権限 user）のアカウントは作れない
//     （保守会社のアカウントは全管理会社分の点検・報告書を見られる。管理会社は自社物件への保守会社の紐付けを自分で書けるので、
//       保守会社アカウントの作成を開くと、任意の保守会社のアカウントを作って他社のデータに入れてしまう）
//   - パスワード変更・有効化／無効化（set_status）・削除（delete_user）: 自社の管理会社ユーザーだけ
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
    // Microsoft でログインする人はパスワード無しで作る（GoTrue がランダムな値を入れるので、パスワードではログインできない）
    if (password && passwordError) return passwordError;
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
      ...(password ? { password } : {}),
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

  if (body.action === 'delete_user') {
    // 削除（修正依頼1115 (1)）。無効化したユーザーだけ。入力・申請などの履歴がある人は断る
    //   - auth.users を消すと signage_entries.user_id・signage_ocr_corrections.recorded_by は CASCADE で一緒に消え、
    //     NO ACTION の3表（紐付けの申請・承認者、点検報告書・物件ファイルの登録者）が残っていると削除自体が失敗するため、先に数えて断る
    //   - 他アプリ（biz/noj/mansion）と共用のアカウントは auth.users を残し、signage のプロファイルだけ消す
    const userId = typeof body.userId === 'string' ? body.userId : '';
    if (!userId) return json({ error: 'ユーザーを指定してください' }, 400);
    if (userId === caller.id) return json({ error: '自分は削除できません' }, 400);
    // signage のプロファイルがある人だけを対象にする（auth.users は他アプリと共用で、プロファイルの無いアカウントは他アプリのもの）
    const { data: target, error: targetError } = await admin
      .from('signage_profiles').select('id, email, role, status, vendor_id, management_company_id').eq('id', userId).maybeSingle();
    if (targetError) return json({ error: `ユーザーの確認に失敗しました: ${targetError.message}` }, 500);
    if (!target || (!callerIsAdmin && !inManagementScope(target))) return json({ error: 'ユーザーが見つかりません' }, 404);
    if (target.status !== 'inactive') return json({ error: '無効化したユーザーだけ削除できます。先に無効化してください' }, 409);
    if (target.role === 'admin') {
      // 有効な管理者が残らない削除は断る（対象は無効なので通常は起きない。念のため）
      const { count, error } = await admin
        .from('signage_profiles').select('id', { count: 'exact', head: true })
        .eq('role', 'admin').eq('status', 'active').neq('id', target.id);
      if (error) return json({ error: `管理者の確認に失敗しました: ${error.message}` }, 500);
      if (!count) return json({ error: '有効な管理者がいなくなるため削除できません' }, 409);
    }
    // 履歴の件数（どれか1つでも確かめられなければ削除しない）
    const refQueries: [string, string][] = [
      ['signage_entries', `user_id.eq.${target.id}`],
      ['signage_building_vendors', `requested_by.eq.${target.id},approved_by.eq.${target.id}`],
      ['signage_inspection_reports', `uploaded_by.eq.${target.id}`],
      ['signage_property_files', `uploaded_by.eq.${target.id}`],
      ['signage_ocr_corrections', `recorded_by.eq.${target.id}`],
    ];
    const refResults = await Promise.all(
      refQueries.map(([table, filter]) => admin.from(table).select('id', { count: 'exact', head: true }).or(filter)),
    );
    const refs: Record<string, number> = {};
    for (let i = 0; i < refQueries.length; i++) {
      const { count, error } = refResults[i];
      if (error) return json({ error: `履歴の確認に失敗しました: ${error.message}` }, 500);
      if (count) refs[refQueries[i][0]] = count;
    }
    if (Object.keys(refs).length > 0) {
      return json({ error: '入力・申請の履歴があるため削除できません。無効化のままにしてください', refs }, 409);
    }
    const { data: shared, error: sharedError } = await admin.rpc('is_shared_auth_user', { target: target.id });
    if (sharedError) return json({ error: `共用アカウントの確認に失敗しました: ${sharedError.message}` }, 500);
    if (shared) {
      // 無効のままの行だけ消す（確かめた後に有効化された場合は消さない）
      const { data: deleted, error } = await admin
        .from('signage_profiles').delete().eq('id', target.id).eq('status', 'inactive').select('id');
      if (error) return json({ error: `削除に失敗しました: ${error.message}` }, 400);
      if (!deleted || deleted.length === 0) return json({ error: '無効化したユーザーだけ削除できます。先に無効化してください' }, 409);
    } else {
      // プロファイルは auth.users の CASCADE で一緒に消える
      const { error } = await admin.auth.admin.deleteUser(target.id);
      if (error) return json({ error: `削除に失敗しました: ${error.message}` }, 400);
    }
    await writeAudit(admin, caller.id, 'DELETE_USER', target.id, {
      email: target.email,
      role: target.role,
      vendor_id: target.vendor_id,
      management_company_id: target.management_company_id,
      shared: !!shared,
    });
    return json({ ok: true, shared: !!shared });
  }

  return json({ error: '不明な操作です' }, 400);
});
