import { supabase, TABLES } from '@/lib/supabase';
import type { DbProfile } from '@/types/database';

// v1: js/supabase/auth.js INACTIVE_ACCOUNT_MESSAGE / NO_PROFILE_MESSAGE / PROFILE_UNKNOWN_MESSAGE
export const INACTIVE_ACCOUNT_MESSAGE =
  'このアカウントは無効化されています。管理者にお問い合わせください。';
export const NO_PROFILE_MESSAGE =
  'このアカウントは点検日入力システムでは利用できません。管理者にお問い合わせください。';
export const PROFILE_UNKNOWN_MESSAGE =
  'アカウント情報を確認できませんでした。もう一度ログインしてください。解決しない場合は管理者にお問い合わせください。';
// v1: login.html ログインフォーム処理の catch
export const LOGIN_FAILED_MESSAGE =
  'ログインに失敗しました。メールアドレスとパスワードを確認してください。';

/** active: 使える / inactive: 無効化 / no_profile: signage のプロファイルが無い / unknown: 通信エラー等で判定できない */
export type AccountAccess = 'active' | 'inactive' | 'no_profile' | 'unknown';

export function accessMessage(access: Exclude<AccountAccess, 'active'>): string {
  if (access === 'inactive') return INACTIVE_ACCOUNT_MESSAGE;
  if (access === 'no_profile') return NO_PROFILE_MESSAGE;
  return PROFILE_UNKNOWN_MESSAGE;
}

/**
 * プロファイルを読み、このシステムを使えるかを判定する。
 * auth.users は他アプリと共用のため、signage のプロファイルが無いアカウントでもログイン自体はできてしまう。
 * 「行が無い」（no_profile）と「通信エラー」（unknown）を区別する。
 */
// v1: js/supabase/auth.js getProfile + checkAccountAccess
export async function fetchProfileAccess(
  userId: string,
): Promise<{ profile: DbProfile | null; access: AccountAccess }> {
  const { data, error } = await supabase
    .from(TABLES.profiles)
    .select('*')
    .eq('id', userId)
    .maybeSingle();
  if (error) return { profile: null, access: 'unknown' };
  if (!data) return { profile: null, access: 'no_profile' };
  const profile = data as DbProfile;
  return { profile, access: profile.status === 'active' ? 'active' : 'inactive' };
}
