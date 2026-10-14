import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { LoginPage } from '../LoginPage';
import { useAuthStore } from '@/stores/authStore';

vi.mock('@/lib/supabase', () => ({ supabase: {}, TABLES: {} }));
vi.mock('@/lib/storage', () => ({ uploadAdImage: vi.fn() }));
vi.mock('@/features/ad-slots/hooks/useAdSlots', () => ({
  useAdSlots: () => ({
    slots: [
      {
        slot_index: 1,
        image_url: 'https://example.com/ad1.png',
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
    expect(screen.getByRole('heading', { name: '📋 点検日入力フォーム' })).toBeInTheDocument();
    expect(screen.getByText('アカウントにログインしてください')).toBeInTheDocument();
    expect(screen.getByText('パスワードを忘れた場合は管理者にお問い合わせください')).toBeInTheDocument();
    expect(screen.getByText('vtest')).toBeInTheDocument();

    const link = screen.getAllByRole('link')[0]!;
    expect(link).toHaveAttribute('href', 'https://example.com');
    expect(link.querySelector('img')).toHaveAttribute('src', 'https://example.com/ad1.png');
    expect(screen.queryByText('広告の説明文')).not.toBeInTheDocument();
    expect(screen.getAllByText('広告スペース')).toHaveLength(2);
  });
});
