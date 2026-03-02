import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '@/stores/authStore';
import { useAdSlots } from '@/features/ad-slots/hooks/useAdSlots';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';

export function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const signIn = useAuthStore((s) => s.signIn);
  const navigate = useNavigate();
  const { slots } = useAdSlots({ activeOnly: true });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      await signIn(email, password);
      navigate('/', { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'ログインに失敗しました');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <div className="w-full max-w-4xl">
        <div className="grid grid-cols-4 grid-rows-2 gap-3">
          {/* 左上: ログインフォーム（2列分） */}
          <div className="col-span-2 row-span-1">
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
                {error && (
                  <p className="text-sm text-red-600 bg-red-50 rounded-md px-3 py-2">{error}</p>
                )}
                <Button type="submit" className="w-full" disabled={loading}>
                  {loading ? 'ログイン中...' : 'ログイン'}
                </Button>
              </form>
            </div>
          </div>

          {/* 広告枠 1-2 (上段右2枠) */}
          {[0, 1].map((i) => (
            <AdSlotCell key={`top-${i}`} slot={slots[i]} />
          ))}

          {/* 広告枠 3-6 (下段4枠) */}
          {[2, 3, 4, 5].map((i) => (
            <AdSlotCell key={`bottom-${i}`} slot={slots[i]} />
          ))}
        </div>

        {/* 7枠目が余れば下に表示 */}
        {slots.length > 6 && (
          <div className="mt-3 grid grid-cols-4 gap-3">
            <AdSlotCell slot={slots[6]} />
          </div>
        )}
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
