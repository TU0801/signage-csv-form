import { useEffect, useState, type InputHTMLAttributes } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { useAuthStore } from '@/stores/authStore';
import { useAdSlots } from '@/features/ad-slots/hooks/useAdSlots';
import { MAX_AD_SLOTS } from '@/lib/constants';
import { isSafeLinkUrl } from '@/lib/utils';
import { Button } from '@/components/ui/Button';
import { Spinner } from '@/components/ui/Spinner';
import type { DbProfile } from '@/types/database';

/** v1: login.html redirectByProfile（管理者は管理画面、それ以外は入力画面） */
function homePathFor(profile: Pick<DbProfile, 'role'>): string {
  return profile.role === 'admin' ? '/admin' : '/';
}

export function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const signIn = useAuthStore((s) => s.signIn);
  const notice = useAuthStore((s) => s.notice);
  const clearNotice = useAuthStore((s) => s.clearNotice);
  const rejectUnknownSession = useAuthStore((s) => s.rejectUnknownSession);
  const initialized = useAuthStore((s) => s.initialized);
  const user = useAuthStore((s) => s.user);
  const profile = useAuthStore((s) => s.profile);
  const navigate = useNavigate();
  const { slots } = useAdSlots({ activeOnly: true });

  // 既にログイン済みでもプロファイルを確認できないセッションは、この端末だけ破棄する（v1: login.html checkAuth）
  useEffect(() => {
    if (initialized && user && !profile) void rejectUnknownSession();
  }, [initialized, user, profile, rejectUnknownSession]);

  if (!initialized) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Spinner size="lg" />
      </div>
    );
  }

  if (user && profile && !loading) {
    return <Navigate to={homePathFor(profile)} replace />;
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    clearNotice();
    setLoading(true);

    try {
      const signedIn = await signIn(email, password);
      navigate(homePathFor(signedIn), { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'ログインに失敗しました');
    } finally {
      setLoading(false);
    }
  };

  // 各画面から無効化で戻された場合の案内
  const message = error || notice || '';

  return (
    // v1: login.html .login-grid（画面いっぱいの 2×2。4 セル同じ大きさ、gap・padding 6px）。lg 未満は縦に積む
    <div className="grid min-h-dvh grid-cols-1 gap-1.5 bg-slate-200 p-1.5 lg:h-dvh lg:grid-cols-2 lg:grid-rows-2">
      {/* フォームのセル。カードは高密度化の対象外で、FHD 対応前の v2 の見た目のまま（ユーザー指定 2026-10-15）。
          入力欄とボタンは共通部品の既定値（高密度）ではなく、当時の大きさで書く。高さが足りないときはセルの中だけスクロールする */}
      <div className="flex min-h-0 overflow-y-auto rounded-xl bg-gray-50 p-4">
        <div className="m-auto w-full max-w-md rounded-lg border border-gray-200 bg-white p-8 shadow-sm">
          {/* v1: login.html .login-header（見出し・副題・#appVersion） */}
          <div className="text-center mb-6">
            <h1 className="text-2xl font-bold text-gray-900">📋 点検日入力フォーム</h1>
            <p className="mt-1 text-sm text-gray-500">アカウントにログインしてください</p>
            <span className="mt-2 inline-block rounded bg-slate-200 px-2 py-0.5 text-xs text-slate-500">
              v{__APP_VERSION__}
            </span>
          </div>
          <form onSubmit={handleSubmit} className="space-y-4">
            <LoginField
              id="login-email"
              label="メールアドレス"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoComplete="email"
              autoFocus
            />
            <LoginField
              id="login-password"
              label="パスワード"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              autoComplete="current-password"
            />
            {message && (
              <p className="text-sm text-red-600 bg-red-50 rounded-md px-3 py-2">{message}</p>
            )}
            <Button type="submit" className="w-full px-4! py-2!" disabled={loading}>
              {loading ? 'ログイン中...' : 'ログイン'}
            </Button>
          </form>
          {/* v1: login.html .login-footer */}
          <p className="mt-6 text-center text-xs text-slate-500">
            パスワードを忘れた場合は管理者にお問い合わせください
          </p>
        </div>
      </div>

      {/* 広告枠は配列の位置ではなく slot_index で置く（v1: login.html loadAdSlots の data-slot） */}
      {Array.from({ length: MAX_AD_SLOTS }, (_, i) => i + 1).map((slotIndex) => (
        <AdSlotCell key={slotIndex} slot={slots.find((s) => s.slot_index === slotIndex)} />
      ))}
    </div>
  );
}

/** ログインの入力欄。共通の Input は高密度の既定値なので、FHD 対応前と同じ大きさ（ラベル 14px・入力欄 px-3 py-2）で書く */
function LoginField({ label, id, ...props }: InputHTMLAttributes<HTMLInputElement> & { label: string; id: string }) {
  return (
    <div className="space-y-1">
      <label htmlFor={id} className="block text-sm font-medium text-gray-700">
        {label}
      </label>
      <input
        id={id}
        className="block w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
        {...props}
      />
    </div>
  );
}

// v1: login.html loadAdSlots（画像だけを出し、キャプションは出さない。alt も空）。v1 .ad-slot（背景 #f8fafc、角丸 12px）
// 画像は切らずに全体を出す（v1 の cover では本番の画像の文字や下端が欠けるため contain。余白はセルの背景）
const AD_CELL = 'min-h-0 overflow-hidden rounded-xl bg-slate-50 aspect-video lg:aspect-auto';

function AdSlotCell({ slot }: { slot?: { image_url: string | null; link_url: string | null } }) {
  if (!slot || !slot.image_url) {
    return (
      <div className={`${AD_CELL} flex items-center justify-center`}>
        <span className="text-sm text-slate-400">広告スペース</span>
      </div>
    );
  }

  const image = <img src={slot.image_url} alt="" className="h-full w-full object-contain" />;

  // javascript: などはリンクにしない（画像だけ出す）
  if (slot.link_url && isSafeLinkUrl(slot.link_url)) {
    return (
      <a href={slot.link_url.trim()} target="_blank" rel="noopener noreferrer" className={`${AD_CELL} block`}>
        {image}
      </a>
    );
  }

  return <div className={AD_CELL}>{image}</div>;
}
