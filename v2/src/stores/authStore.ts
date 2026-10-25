import { create } from 'zustand';
import type { User, Session } from '@supabase/supabase-js';
import type { DbProfile } from '@/types/database';
import { supabase } from '@/lib/supabase';
import {
  fetchProfileAccess,
  accessMessage,
  LOGIN_FAILED_MESSAGE,
  MICROSOFT_LOGIN_FAILED_MESSAGE,
  PROFILE_UNKNOWN_MESSAGE,
} from '@/lib/api/auth';

interface AuthState {
  user: User | null;
  session: Session | null;
  profile: DbProfile | null;
  loading: boolean;
  initialized: boolean;
  /** ログイン画面に出す案内（無効化・プロファイル無しで戻されたとき。v1 の sessionStorage loginNotice） */
  notice: string | null;
  /** 別タブでログアウト・別アカウントでログインされた（v1 の window.sessionUserChanged） */
  sessionChanged: boolean;
  /** ログインし、使えるアカウントならプロファイルを返す。使えなければこの端末のセッションを破棄して日本語の Error を投げる */
  signIn: (email: string, password: string) => Promise<DbProfile>;
  /** Microsoft（Entra ID）の画面へ移る。戻り先は /login で、セッションの交換とプロファイルの判定は initialize が行う */
  signInWithMicrosoft: () => Promise<void>;
  signOut: () => Promise<void>;
  /** プロファイルを確認できないセッションを、この端末だけ破棄してログイン画面に案内を出す */
  rejectUnknownSession: () => Promise<void>;
  clearNotice: () => void;
  initialize: () => Promise<() => void>;
}

export const useAuthStore = create<AuthState>((set, get) => ({
  user: null,
  session: null,
  profile: null,
  loading: true,
  initialized: false,
  notice: null,
  sessionChanged: false,

  // v1: login.html redirectByProfile（ログイン直後は判定不能も入れない）
  signIn: async (email, password) => {
    set({ notice: null });
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error || !data.user) throw new Error(LOGIN_FAILED_MESSAGE);
    const { profile, access } = await fetchProfileAccess(data.user.id);
    if (access !== 'active' || !profile) {
      await supabase.auth.signOut({ scope: 'local' });
      throw new Error(accessMessage(access === 'active' ? 'unknown' : access));
    }
    set({ session: data.session, user: data.user, profile });
    return profile;
  },

  // 受け入れるテナントの確認・未登録者の拒否は DB 側（scripts/sso-azure.sql）が行う。
  // email スコープが無いと ID トークンにメールが入らず、事前登録したアカウントにリンクできない
  signInWithMicrosoft: async () => {
    set({ notice: null });
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'azure',
      options: { scopes: 'email', redirectTo: `${window.location.origin}/login` },
    });
    if (error) throw new Error(MICROSOFT_LOGIN_FAILED_MESSAGE);
  },

  signOut: async () => {
    // 先に画面のユーザーを外す（自分のログアウトを別タブでの切り替えと取り違えない）
    set({ user: null, session: null, profile: null });
    // この端末のセッションだけを終える。既定（global）だと同じアカウントの全端末が切れ、
    // a@a のような共用アカウントでは他の人の画面までログイン切れになる
    await supabase.auth.signOut({ scope: 'local' });
  },

  // v1: login.html checkAuth → redirectByProfile（判定不能は scope:'local' で破棄）
  rejectUnknownSession: async () => {
    set({ user: null, session: null, profile: null, notice: PROFILE_UNKNOWN_MESSAGE });
    await supabase.auth.signOut({ scope: 'local' });
  },

  clearNotice: () => set({ notice: null }),

  initialize: async () => {
    const {
      data: { session },
    } = await supabase.auth.getSession();

    if (session?.user) {
      // v1: js/supabase/auth.js rejectInactiveUser（画面を開いたときは、無効化・プロファイル無しだけ戻す。
      // 通信エラー等で判定できない場合は戻さない＝データは RLS が保護している）
      const { profile, access } = await fetchProfileAccess(session.user.id);
      if (access === 'inactive' || access === 'no_profile') {
        await supabase.auth.signOut({ scope: 'local' });
        set({ notice: accessMessage(access) });
      } else {
        set({ session, user: session.user, profile });
      }
    }
    // プロファイルの確認を終えてから初期化済みにする（管理者の再読み込みで一瞬 '/' へ飛ばされないように）
    set({ loading: false, initialized: true });

    // v1: js/supabase/auth.js watchSessionUser
    // コールバック内で auth API や DB を await するとロック待ちになるため、抜けてから現在のセッションを確認する
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(() => {
      setTimeout(() => {
        void handleAuthChange();
      }, 0);
    });

    async function handleAuthChange() {
      const {
        data: { session: current },
      } = await supabase.auth.getSession();
      const currentId = current?.user?.id ?? null;
      const shownId = get().user?.id ?? null;
      if (currentId === shownId) {
        // トークン更新など、同じユーザーのままのイベント
        if (currentId) set({ session: current });
        return;
      }
      // ログイン画面での新しいログインは signIn が受け持つ
      if (!shownId) return;
      if (currentId) {
        // 別アカウントに切り替わった: 画面を塞いで開き直す（別人の権限で操作を続けさせない）
        set({ sessionChanged: true });
        window.location.reload();
      } else {
        // 別タブでログアウトされた: 未ログイン状態にしてログイン画面へ（ルートガードが遷移させる）
        set({ user: null, session: null, profile: null });
      }
    }

    return () => subscription.unsubscribe();
  },
}));
