import { create } from 'zustand';
import type { User, Session } from '@supabase/supabase-js';
import type { DbProfile } from '@/types/database';
import { supabase, TABLES } from '@/lib/supabase';

interface AuthState {
  user: User | null;
  session: Session | null;
  profile: DbProfile | null;
  loading: boolean;
  initialized: boolean;
  setSession: (session: Session | null) => void;
  fetchProfile: () => Promise<void>;
  signIn: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
  initialize: () => Promise<() => void>;
}

export const useAuthStore = create<AuthState>((set, get) => ({
  user: null,
  session: null,
  profile: null,
  loading: true,
  initialized: false,

  setSession: (session) => {
    set({ session, user: session?.user ?? null });
  },

  fetchProfile: async () => {
    const { user } = get();
    if (!user) {
      set({ profile: null });
      return;
    }
    const { data } = await supabase
      .from(TABLES.profiles)
      .select('*')
      .eq('id', user.id)
      .single();
    set({ profile: data as DbProfile | null });
  },

  signIn: async (email, password) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw error;
  },

  signOut: async () => {
    await supabase.auth.signOut();
    set({ user: null, session: null, profile: null });
  },

  initialize: async () => {
    const {
      data: { session },
    } = await supabase.auth.getSession();
    set({ session, user: session?.user ?? null, loading: false, initialized: true });

    if (session?.user) {
      await get().fetchProfile();
    }

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(async (_event, session) => {
      set({ session, user: session?.user ?? null });
      if (session?.user) {
        await get().fetchProfile();
      } else {
        set({ profile: null });
      }
    });

    return () => subscription.unsubscribe();
  },
}));
