import { FunctionsHttpError } from '@supabase/supabase-js';
import { supabase, EDGE_FUNCTIONS } from '@/lib/supabase';
import type { DbProfile } from '@/types/database';

/**
 * ユーザー作成・パスワード変更は service_role が必要なため、管理者検証付きの Edge Function で行う。
 * signage_profiles には INSERT / DELETE のポリシーが無く、クライアントから直接は作れない・消せない。
 * 失敗時は Edge Function が返す日本語の error 文言を投げる。
 */
// v1: js/supabase/users.js invokeAdminUsers
async function invokeAdminUsers<T>(body: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.functions.invoke(EDGE_FUNCTIONS.adminUsers, { body });
  if (error) {
    let message: string = error.message;
    if (error instanceof FunctionsHttpError) {
      try {
        const payload = (await error.context.json()) as { error?: string };
        message = payload.error || message;
      } catch {
        // レスポンス本文が JSON でない場合は SDK のメッセージを使う
      }
    }
    throw new Error(message);
  }
  return data as T;
}

/** 認証ユーザーとプロファイル（status='active'）を作る。会社の列は role に合わせて Edge Function がそろえる */
// v1: js/supabase/users.js createUser
export async function createUser(params: {
  email: string;
  password: string;
  role: DbProfile['role'];
  vendorId?: string | null;
  /** role='management' のときだけ必須（biz.companies の管理会社） */
  managementCompanyId?: string | null;
}): Promise<DbProfile> {
  const { user } = await invokeAdminUsers<{ user: DbProfile }>({
    action: 'create_user',
    email: params.email,
    password: params.password,
    role: params.role,
    vendorId: params.vendorId ?? null,
    managementCompanyId: params.managementCompanyId ?? null,
  });
  return user;
}

/** パスワード変更（他システムと共用のアカウントは Edge Function が断る） */
// v1: js/supabase/users.js updateUserPassword
export async function setUserPassword(userId: string, password: string): Promise<void> {
  await invokeAdminUsers<{ ok: true }>({ action: 'set_password', userId, password });
}
