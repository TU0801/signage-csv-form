import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { InspectionTypeFormModal } from '../components/InspectionTypeFormModal';
import type { DbInspectionType } from '@/types/database';

vi.mock('@/lib/supabase', () => ({ supabase: {}, TABLES: {}, RPC: {} }));
vi.mock('@/lib/storage', () => ({ getPublicUrl: (p: string) => `https://storage/${p}` }));

beforeEach(() => {
  // jsdom には <dialog> の showModal / close が無い
  HTMLDialogElement.prototype.showModal ??= function () {};
  HTMLDialogElement.prototype.close ??= function () {};
});

const item: DbInspectionType = {
  id: 'i1',
  inspection_name: 'エレベーター点検',
  template_no: '1124 235959elevator_inspection',
  template_image: null,
  default_text: null,
  category_id: null,
  category: '点検',
  show_on_board: true,
  sort_order: 1,
  created_at: null,
};

describe('点検種別モーダルのプレビュー（v1 admin-masters.js updateTemplatePreviewWithMasterData）', () => {
  it('業務システムの画像が無いときは固定表の画像（Storage の templates/）を出す', () => {
    render(
      <InspectionTypeFormModal item={item} categories={[]} templateImages={[]} onClose={vi.fn()} onSubmit={vi.fn()} />,
    );
    const img = screen.getByRole('img', { hidden: true });
    expect(img).toHaveAttribute('src', 'https://storage/templates/elevator_inspection.png');
  });
});
