import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { EntryDetailModal } from '../components/EntryDetailModal';

vi.mock('@/lib/supabase', () => ({ supabase: {}, SUPABASE_URL: 'https://example.supabase.co' }));
import type { DbEntry } from '@/types/database';

const entry = {
  id: 'e1',
  user_id: 'u1',
  property_code: '900001-00',
  terminal_id: 'T001',
  vendor_name: 'テスト保守',
  emergency_contact: '',
  inspection_type: 'エレベーター定期点検',
  template_no: '1',
  inspection_start: '2026-11-10',
  inspection_end: '2026-11-10',
  display_start_date: null,
  display_start_time: null,
  display_end_date: null,
  display_end_time: null,
  display_duration: 6,
  announcement: '',
  remarks: '10:00～12:00',
  poster_type: 'template',
  poster_position: '2',
  frame_no: null,
  status: 'draft',
  poster_image: null,
  inspection_co: 1,
  memo: '点検月を11月に変更',
  created_at: '2026-10-24T00:00:00Z',
  updated_at: null,
} as DbEntry;

describe('承認画面の詳細（管理者）', () => {
  it('申請のメモ（CSV に出さない項目）を出す（B12）', () => {
    HTMLDialogElement.prototype.showModal ??= function (this: HTMLDialogElement) {
      this.open = true;
    };
    HTMLDialogElement.prototype.close ??= function (this: HTMLDialogElement) {
      this.open = false;
    };
    render(<EntryDetailModal entry={entry} onClose={() => {}} propertyNames={new Map()} emailOf={() => ''} displayDefault={6} />);
    expect(screen.getByText('メモ（CSV外）')).toBeInTheDocument();
    expect(screen.getByText('点検月を11月に変更')).toBeInTheDocument();
  });

  it('追加の貼紙の画像は、このプロジェクトの poster-images の URL だけを出す（javascript: などは出さない）', () => {
    HTMLDialogElement.prototype.showModal ??= function (this: HTMLDialogElement) {
      this.open = true;
    };
    const ok = 'https://example.supabase.co/storage/v1/object/public/poster-images/u1/a.png';
    const props = { onClose: () => {}, propertyNames: new Map<string, string>(), emailOf: () => '', displayDefault: 6 };
    const { unmount } = render(<EntryDetailModal entry={{ ...entry, poster_type: 'custom', poster_image: ok }} {...props} />);
    expect(screen.getByAltText('貼紙画像')).toHaveAttribute('src', ok);
    unmount();

    render(<EntryDetailModal entry={{ ...entry, poster_type: 'custom', poster_image: 'javascript:alert(1)' }} {...props} />);
    expect(screen.queryByAltText('貼紙画像')).not.toBeInTheDocument();
    expect(screen.getByText('表示できない画像の URL です')).toBeInTheDocument();
  });

  it('2枚目以降の貼紙（修正依頼1025 D3）を全部出し、出どころと位置を添える', () => {
    HTMLDialogElement.prototype.showModal ??= function (this: HTMLDialogElement) {
      this.open = true;
    };
    const lib = 'https://example.supabase.co/storage/v1/object/public/poster-images/library/common/n.png';
    const up = 'https://example.supabase.co/storage/v1/object/public/poster-images/u1/b.png';
    render(
      <EntryDetailModal
        entry={{
          ...entry,
          extra_posters: [
            { image_url: lib, source: 'library', library_id: 'L1' },
            { image_url: up, source: 'upload', position: '0' },
          ],
        }}
        onClose={() => {}}
        propertyNames={new Map()}
        emailOf={() => ''}
        displayDefault={6}
      />,
    );
    expect(screen.getByText('追加の貼紙（2枚）')).toBeInTheDocument();
    expect(screen.getByAltText('2枚目の貼紙')).toHaveAttribute('src', lib);
    expect(screen.getByAltText('3枚目の貼紙')).toHaveAttribute('src', up);
    expect(screen.getByText(/2枚目・ライブラリ・/)).toBeInTheDocument();
    expect(screen.getByText(/3枚目・アップロード・/)).toHaveTextContent('全体');
  });
});
