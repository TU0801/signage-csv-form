import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import type { DbAdSlot } from '@/types/database';

const toast = vi.hoisted(() => ({ addToast: vi.fn() }));
vi.mock('@/components/ui/Toast', () => ({ useToast: () => toast }));
vi.mock('@/lib/supabase', () => ({ supabase: {}, TABLES: { adSlots: 'signage_ad_slots' } }));
vi.mock('@/lib/storage', () => ({ uploadAdImage: vi.fn(), deleteStorageFile: vi.fn() }));
// react-easy-crop は jsdom で寸法を測れないので、切り抜き範囲を決めた体の部品に置き換える
vi.mock('react-easy-crop', () => ({
  default: ({ onCropComplete }: { onCropComplete: (a: unknown, p: unknown) => void }) => (
    <button type="button" onClick={() => onCropComplete({}, { x: 0, y: 0, width: 200, height: 100 })}>
      範囲を決める
    </button>
  ),
}));
const crop = vi.hoisted(() => ({ cropAdImage: vi.fn() }));
vi.mock('../lib/adImage', async (orig) => ({ ...(await orig<typeof import('../lib/adImage')>()), ...crop }));

import { AdSlotModal } from '../components/AdSlotModal';

const slot: DbAdSlot = {
  id: 's3',
  slot_index: 3,
  image_url: 'http://127.0.0.1:55321/storage/v1/object/public/poster-images/ads/slot_3.png?v=1',
  caption: '鍵の案内',
  link_url: '',
  is_active: true,
  sort_order: 0,
  created_at: null,
  updated_at: null,
};

beforeEach(() => {
  vi.clearAllMocks();
  // jsdom の <dialog> は showModal/close を持たない。開いた状態にして中身を読めるようにする
  HTMLDialogElement.prototype.showModal ??= function (this: HTMLDialogElement) {
    this.open = true;
  };
  HTMLDialogElement.prototype.close ??= function (this: HTMLDialogElement) {
    this.open = false;
  };
  URL.createObjectURL ??= () => 'blob:test';
  URL.revokeObjectURL ??= () => {};
});

describe('AdSlotModal（広告枠の編集）', () => {
  it('『コンテンツを削除』は確認してから onClear を呼ぶ', async () => {
    const onClear = vi.fn(async () => {});
    const onClose = vi.fn();
    render(<AdSlotModal slot={slot} onClose={onClose} onSave={vi.fn()} onClear={onClear} />);

    fireEvent.click(screen.getByRole('button', { name: 'コンテンツを削除' }));
    expect(onClear).not.toHaveBeenCalled();
    expect(screen.getByText(/元に戻せません/)).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: '削除する' }));
    await waitFor(() => expect(onClear).toHaveBeenCalledWith(slot));
    expect(onClose).toHaveBeenCalled();
  });

  it('画像を選ぶと切り抜き画面を出し、切り抜いた画像を保存に渡す（切り抜き中は保存できない）', async () => {
    const cropped = new File(['png'], 'slot_3.png', { type: 'image/png' });
    crop.cropAdImage.mockResolvedValue(cropped);
    const onSave = vi.fn(async () => {});
    render(<AdSlotModal slot={slot} onClose={vi.fn()} onSave={onSave} onClear={vi.fn()} />);

    const original = new File(['x'], 'photo.png', { type: 'image/png' });
    fireEvent.change(screen.getByLabelText(/画像を選ぶ/), { target: { files: [original] } });
    expect(screen.getByTestId('ad-image-cropper')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '保存' })).toBeDisabled();

    fireEvent.click(screen.getByRole('button', { name: '範囲を決める' }));
    fireEvent.click(screen.getByRole('button', { name: 'この範囲で切り抜く' }));
    await waitFor(() => expect(screen.queryByTestId('ad-image-cropper')).not.toBeInTheDocument());
    expect(crop.cropAdImage).toHaveBeenCalledWith(expect.any(String), { x: 0, y: 0, width: 200, height: 100 }, 'image/png', 3);

    fireEvent.click(screen.getByRole('button', { name: '保存' }));
    await waitFor(() => expect(onSave).toHaveBeenCalledWith(slot, expect.objectContaining({ imageFile: cropped })));
  });

  it('保存済みの画像を切り抜き直せる（公開 URL を元の形式で切り抜く）', async () => {
    crop.cropAdImage.mockResolvedValue(new File(['png'], 'slot_3.png', { type: 'image/png' }));
    render(<AdSlotModal slot={slot} onClose={vi.fn()} onSave={vi.fn()} onClear={vi.fn()} />);

    fireEvent.click(screen.getByRole('button', { name: '現在の画像を切り抜き直す' }));
    fireEvent.click(screen.getByRole('button', { name: '範囲を決める' }));
    fireEvent.click(screen.getByRole('button', { name: 'この範囲で切り抜く' }));
    await waitFor(() =>
      expect(crop.cropAdImage).toHaveBeenCalledWith(slot.image_url, expect.anything(), 'image/png', 3),
    );
  });
});
