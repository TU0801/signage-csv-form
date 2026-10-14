import { describe, it, expect, vi } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import { InspectionTypesMaster } from '../instances/InspectionTypesMaster';
import type { DbInspectionType, DbTemplateImage } from '@/types/database';

vi.mock('@/lib/supabase', () => ({ supabase: {}, TABLES: {}, RPC: {} }));
vi.mock('@/components/ui/Toast', () => ({ useToast: () => ({ addToast: vi.fn() }) }));
// jsdom の <dialog> には close() が無いので、削除確認（Modal）は描かない
vi.mock('../components/MasterDeleteConfirm', () => ({ MasterDeleteConfirm: () => null }));

let resolveImages: (v: DbTemplateImage[]) => void = () => {};
const inspection: DbInspectionType = {
  id: 'i1',
  inspection_name: 'エレベーター点検',
  template_no: 'elevator_inspection',
  template_image: null,
  default_text: null,
  category_id: null,
  category: '点検',
  show_on_board: true,
  sort_order: 1,
  created_at: null,
};

vi.mock('@/lib/api/masterData', () => ({
  fetchMasterInspectionTypes: vi.fn(async () => [inspection]),
  fetchMasterCategories: vi.fn(async () => []),
  fetchTemplateImages: vi.fn(
    () => new Promise<DbTemplateImage[]>((resolve) => (resolveImages = resolve)),
  ),
}));

// v1 は getAllMasterData（テンプレート画像を含む）を読み終えてから描く。画像の前に編集を開かせない
describe('InspectionTypesMaster', () => {
  it('does not offer 編集 / 新規追加 until template images have loaded', async () => {
    render(<InspectionTypesMaster />);
    await act(async () => {
      await new Promise((r) => setTimeout(r, 0));
    });
    expect(screen.queryByRole('button', { name: '編集' })).toBeNull();
    expect(screen.queryByRole('button', { name: '+ 新規追加' })).toBeNull();

    await act(async () => {
      resolveImages([]);
      await new Promise((r) => setTimeout(r, 0));
    });
    expect(screen.getByRole('button', { name: '編集' })).toBeTruthy();
    expect(screen.getByRole('button', { name: '+ 新規追加' })).toBeTruthy();
  });
});
