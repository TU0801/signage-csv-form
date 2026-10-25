import { describe, it, expect, vi } from 'vitest';

const auth = vi.hoisted(() => ({ signOut: vi.fn(async () => ({ error: null })) }));
vi.mock('@/lib/supabase', () => ({ supabase: { auth } }));

import { useAuthStore } from '../authStore';

describe('authStore.signOut', () => {
  it('この端末のセッションだけを終える（共用アカウントの他の端末を巻き込まない）', async () => {
    useAuthStore.setState({ user: { id: 'u1' } as never, profile: { id: 'u1' } as never });
    await useAuthStore.getState().signOut();
    expect(auth.signOut).toHaveBeenCalledWith({ scope: 'local' });
    expect(useAuthStore.getState().user).toBeNull();
  });
});
