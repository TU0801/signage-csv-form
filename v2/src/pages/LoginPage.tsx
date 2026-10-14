import { useEffect, useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { useAuthStore } from '@/stores/authStore';
import { useAdSlots } from '@/features/ad-slots/hooks/useAdSlots';
import { MAX_AD_SLOTS } from '@/lib/constants';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
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
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <div className="w-full max-w-4xl">
        {/* 2×2: 左上ログインフォーム＋広告枠1〜3（v1: login.html） */}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-8 h-full flex flex-col justify-center">
              <h1 className="text-2xl font-bold text-center text-gray-900 mb-6">
                サイネージCMS
              </h1>
              <form onSubmit={handleSubmit} className="space-y-4">
                <Input
                  label="メールアドレス"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  autoComplete="email"
                  autoFocus
                />
                <Input
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
                <Button type="submit" className="w-full" disabled={loading}>
                  {loading ? 'ログイン中...' : 'ログイン'}
                </Button>
              </form>
            </div>
          </div>

          {/* 広告枠は配列の位置ではなく slot_index で置く（v1: login.html loadAdSlots の data-slot） */}
          {Array.from({ length: MAX_AD_SLOTS }, (_, i) => i + 1).map((slotIndex) => (
            <AdSlotCell key={slotIndex} slot={slots.find((s) => s.slot_index === slotIndex)} />
          ))}
        </div>
      </div>
    </div>
  );
}

function AdSlotCell({ slot }: { slot?: { image_url: string | null; caption: string | null; link_url: string | null } }) {
  if (!slot || !slot.image_url) {
    return (
      <div className="bg-gray-100 rounded-lg border border-gray-200 flex items-center justify-center min-h-[120px]">
        <span className="text-xs text-gray-400">広告スペース</span>
      </div>
    );
  }

  const content = (
    <div className="bg-white rounded-lg border border-gray-200 overflow-hidden h-full flex flex-col">
      <div className="flex-1 flex items-center justify-center p-1">
        <img
          src={slot.image_url}
          alt={slot.caption ?? ''}
          className="max-w-full max-h-[100px] object-contain"
        />
      </div>
      {slot.caption && (
        <div className="px-2 py-1 text-xs text-gray-600 text-center border-t border-gray-100 truncate">
          {slot.caption}
        </div>
      )}
    </div>
  );

  if (slot.link_url) {
    return (
      <a
        href={slot.link_url}
        target="_blank"
        rel="noopener noreferrer"
        className="block hover:shadow-md transition-shadow"
      >
        {content}
      </a>
    );
  }

  return content;
}
