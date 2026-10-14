import { useAuthStore } from '@/stores/authStore';

/**
 * 別タブでアカウントが切り替わったときに画面を塞ぐ。
 * 開き直しが離脱確認で止められても、別人の権限で操作を続けさせない。
 * v1: js/supabase/auth.js showSessionChangedOverlay
 */
export function SessionChangedOverlay() {
  const sessionChanged = useAuthStore((s) => s.sessionChanged);
  if (!sessionChanged) return null;

  return (
    <div className="fixed inset-0 z-[100000] flex items-center justify-center bg-slate-900/75">
      <div className="max-w-md rounded-xl bg-white px-8 py-6 text-center text-sm text-slate-800">
        <p className="mb-4">
          別のタブでログアウト、または別のアカウントでログインしたため、この画面は使用できません。
        </p>
        <button
          type="button"
          onClick={() => window.location.reload()}
          className="rounded-md bg-blue-600 px-5 py-2 text-white hover:bg-blue-700"
        >
          画面を開き直す
        </button>
      </div>
    </div>
  );
}
