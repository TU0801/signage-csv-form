import { create } from 'zustand';
import { useAuthStore } from '@/stores/authStore';
import type { LocalEntry } from '../types';

/**
 * 1件入力の申請前の作成データ。画面の state だと一括入力・管理へ移っただけで黙って消えるので store に置く。
 * メモリだけに持つ（追加画像の File は sessionStorage に入らない）。再読み込み・タブを閉じるときは下の beforeunload で警告する。
 * 別のユーザーで入り直したときに前のユーザーの行を見せないよう userId と組で持つ。
 */
interface SingleEntryState {
  userId: string | null;
  entries: LocalEntry[];
  /** 申請中か。画面を移って戻っても二重に申請させないため store に置く */
  submitting: boolean;
  setSubmitting: (submitting: boolean) => void;
  /** 画面を開いたときに呼ぶ。別のユーザーなら行を捨てる */
  bindUser: (userId: string | null) => void;
  setEntries: (next: LocalEntry[] | ((prev: LocalEntry[]) => LocalEntry[])) => void;
  clear: () => void;
}

export const useSingleEntryStore = create<SingleEntryState>((set, get) => ({
  userId: null,
  entries: [],
  submitting: false,
  setSubmitting: (submitting) => set({ submitting }),
  bindUser: (userId) => {
    if (get().userId !== userId) set({ userId, entries: [] });
  },
  setEntries: (next) => set((s) => ({ entries: typeof next === 'function' ? next(s.entries) : next })),
  clear: () => set({ entries: [] }),
}));

/** 今ログインしているユーザーの申請前の作成データがあるか（別のユーザーが残した行は数えない） */
export function hasUnsentSingleEntries(): boolean {
  const s = useSingleEntryStore.getState();
  return s.entries.length > 0 && s.userId === (useAuthStore.getState().user?.id ?? null);
}

// 再読み込み・タブを閉じる前の確認。1件入力の画面を離れても行は残るので、画面ではなくここで常に見張る
// （一括入力と同じ。別タブでのアカウント切替で開き直すときは出さない）
function confirmBeforeUnload(e: BeforeUnloadEvent) {
  if (useAuthStore.getState().sessionChanged || !hasUnsentSingleEntries()) return;
  e.preventDefault();
  e.returnValue = '';
}

if (typeof window !== 'undefined') {
  let listening = false;
  useSingleEntryStore.subscribe((s) => {
    const want = s.entries.length > 0;
    if (want === listening) return;
    listening = want;
    if (want) window.addEventListener('beforeunload', confirmBeforeUnload);
    else window.removeEventListener('beforeunload', confirmBeforeUnload);
  });
}
