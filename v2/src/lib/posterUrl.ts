import { SUPABASE_URL } from '@/lib/supabase';

/**
 * 追加画像の URL を、このプロジェクトの poster-images（公開バケット）のものだけに限る。
 * 値は保守会社が書けるので、javascript: などをそのまま href / src に入れると、開いた管理会社・管理者のブラウザで動いてしまう。
 * 点検一覧の詳細（inspection-portal）と承認待ちの「追加登録された画像」で共通に使う
 */
export function safePosterUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  try {
    const u = new URL(url);
    const base = new URL(SUPABASE_URL);
    return (u.protocol === 'https:' || u.protocol === 'http:') &&
      u.origin === base.origin &&
      u.pathname.startsWith('/storage/v1/object/public/poster-images/')
      ? u.href
      : null;
  } catch {
    return null;
  }
}
