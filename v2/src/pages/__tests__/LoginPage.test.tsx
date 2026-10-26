import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { LoginPage } from '../LoginPage';
import { useAuthStore } from '@/stores/authStore';
import { MICROSOFT_LOGIN_FAILED_MESSAGE, PRE_REGISTRATION_REQUIRED_MESSAGE } from '@/lib/api/auth';

vi.mock('@/lib/supabase', () => ({ supabase: {}, TABLES: {}, SUPABASE_URL: 'https://example.supabase.co' }));
vi.mock('@/lib/storage', () => ({ uploadAdImage: vi.fn() }));
vi.mock('@/features/ad-slots/hooks/useAdSlots', () => ({
  useAdSlots: () => ({
    slots: [
      {
        slot_index: 1,
        image_url: 'https://example.supabase.co/storage/v1/object/public/poster-images/ads/slot_1.png',
        caption: '広告の説明文',
        link_url: 'https://example.com',
        is_active: true,
      },
    ],
  }),
}));

describe('ログイン画面（v1 login.html）', () => {
  it('v1 の見出し・副題・フッターを出し、広告はキャプション無しで画像だけ出す', () => {
    useAuthStore.setState({ initialized: true, loading: false, user: null, profile: null });
    render(
      <MemoryRouter>
        <LoginPage />
      </MemoryRouter>,
    );
    expect(screen.getByRole('heading', { name: '📋 設備点検管理システム' })).toBeInTheDocument();
    expect(screen.getByText('アカウントにログインしてください')).toBeInTheDocument();
    expect(screen.getByText('パスワードを忘れた場合は管理者にお問い合わせください')).toBeInTheDocument();
    expect(screen.getByText('vtest')).toBeInTheDocument();

    const link = screen.getAllByRole('link')[0]!;
    expect(link).toHaveAttribute('href', 'https://example.com');
    expect(link.querySelector('img')).toHaveAttribute('src', 'https://example.supabase.co/storage/v1/object/public/poster-images/ads/slot_1.png');
    expect(screen.queryByText('広告の説明文')).not.toBeInTheDocument();
    expect(screen.getAllByText('広告スペース')).toHaveLength(2);
  });

  it('本番の設定が済むまで（VITE_ENABLE_MICROSOFT_LOGIN が無い）「Microsoft でログイン」を出さない', () => {
    useAuthStore.setState({ initialized: true, loading: false, user: null, profile: null });
    render(
      <MemoryRouter>
        <LoginPage />
      </MemoryRouter>,
    );
    expect(screen.queryByRole('button', { name: 'Microsoft でログイン' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'ログイン' })).toBeInTheDocument();
  });

  it('「Microsoft でログイン」で Microsoft の画面へ移る処理を呼ぶ', async () => {
    vi.stubEnv('VITE_ENABLE_MICROSOFT_LOGIN', 'true');
    const signInWithMicrosoft = vi.fn(async () => {});
    useAuthStore.setState({ initialized: true, loading: false, user: null, profile: null, signInWithMicrosoft });
    render(
      <MemoryRouter>
        <LoginPage />
      </MemoryRouter>,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Microsoft でログイン' }));
    await waitFor(() => expect(signInWithMicrosoft).toHaveBeenCalledTimes(1));
    expect(screen.getByRole('button', { name: 'Microsoft でログイン' })).toBeDisabled();

    // Microsoft の画面から「戻る」でキャッシュから復元されたら、また押せるようにする
    const restored = new Event('pageshow') as PageTransitionEvent;
    Object.defineProperty(restored, 'persisted', { value: true });
    act(() => {
      window.dispatchEvent(restored);
    });
    expect(screen.getByRole('button', { name: 'Microsoft でログイン' })).toBeEnabled();
    vi.unstubAllEnvs();
  });

  it('Microsoft ログインで拒否されて戻ったら、URL のエラーを日本語で出して URL から消す', () => {
    window.history.replaceState(null, '', '/login?error=access_denied&error_code=signup_disabled&error_description=Database+error+saving+new+user');
    useAuthStore.setState({ initialized: true, loading: false, user: null, profile: null });
    render(
      <MemoryRouter>
        <LoginPage />
      </MemoryRouter>,
    );
    expect(screen.getByText(MICROSOFT_LOGIN_FAILED_MESSAGE)).toBeInTheDocument();
    expect(window.location.search).toBe('');
  });

  it('URL に付けた任意の日本語は出さず、フックの断り文言のときだけその案内を出す', () => {
    window.history.replaceState(null, '', `/login?error=x&error_description=${encodeURIComponent('至急こちらへお電話ください')}`);
    useAuthStore.setState({ initialized: true, loading: false, user: null, profile: null });
    const { unmount } = render(
      <MemoryRouter>
        <LoginPage />
      </MemoryRouter>,
    );
    expect(screen.queryByText('至急こちらへお電話ください')).not.toBeInTheDocument();
    expect(screen.getByText(MICROSOFT_LOGIN_FAILED_MESSAGE)).toBeInTheDocument();
    unmount();

    window.history.replaceState(null, '', `/login?error=x&error_description=${encodeURIComponent(PRE_REGISTRATION_REQUIRED_MESSAGE)}`);
    render(
      <MemoryRouter>
        <LoginPage />
      </MemoryRouter>,
    );
    expect(screen.getByText(PRE_REGISTRATION_REQUIRED_MESSAGE)).toBeInTheDocument();
  });
});
