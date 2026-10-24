import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { EntryDetailModal } from '../components/EntryDetailModal';
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
});
