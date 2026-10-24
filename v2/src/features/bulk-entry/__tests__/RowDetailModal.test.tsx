import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import { ToastProvider } from '@/components/ui/Toast';
import { useBulkStore, resetBulkSession } from '@/stores/bulkStore';
import { RowDetailModal } from '../modals/RowDetailModal';
import { createMemoryStorage } from './memoryStorage';

const io = vi.hoisted(() => ({
  preparePosterImage: vi.fn(),
  uploadPosterImage: vi.fn(),
}));
vi.mock('@/lib/supabase', () => ({ supabase: {}, TABLES: {}, RPC: {} }));
vi.mock('@/lib/pdfToPng', () => ({ preparePosterImage: io.preparePosterImage }));
vi.mock('@/lib/storage', () => ({ uploadPosterImage: io.uploadPosterImage }));
vi.mock('@/lib/templateStorage', () => ({ templateFileUrl: (f: string) => `https://storage/templates/${f}` }));

function setup() {
  const store = useBulkStore.getState();
  store.setUserId('user-1');
  store.setMasterData({
    properties: [{ propertyCode: 'z0001A01', propertyName: '物件A', terminalId: 'T-A1', supplement: '' }],
    vendors: [{ id: 'v1', vendorName: 'A社', emergencyContact: '092-000-0000' }],
    notices: [{ inspectionType: '消防設備点検', templateNo: 'fire_inspection', noticeText: '点検中です' }],
    templateImages: [{ image_key: 'Fire_Inspection', image_url: 'https://img/fire.png', display_name: '消防設備点検（テンプレ）' }],
  });
  store.setCurrentVendor({ id: 'v1', name: 'A社' });
  const id = store.addRow({
    propertyCode: 'z0001A01',
    inspectionType: '消防設備点検',
    startDate: '2026-11-02',
    endDate: '2026-11-03',
  });
  render(
    <ToastProvider>
      <RowDetailModal open rowId={id} onClose={() => {}} />
    </ToastProvider>,
  );
  return id;
}

const rowOf = (id: number) => useBulkStore.getState().rows.find((r) => r.id === id)!;

describe('RowDetailModal（修正依頼1024 B18）', () => {
  beforeEach(() => {
    // jsdom の <dialog> は showModal/close を持たない。開いた状態にして中身を読めるようにする
    HTMLDialogElement.prototype.showModal ??= function (this: HTMLDialogElement) {
      this.open = true;
    };
    HTMLDialogElement.prototype.close ??= function (this: HTMLDialogElement) {
      this.open = false;
    };
    vi.stubGlobal('localStorage', createMemoryStorage());
    resetBulkSession();
    io.preparePosterImage.mockReset();
    io.uploadPosterImage.mockReset();
  });
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it('案内文の説明・連絡先の既定（保守会社の緊急連絡先）・テンプレート名を出し、表示期間は畳んでおく', () => {
    const id = setup();
    expect(screen.getByText(/デフォルトで表示される案内文/)).toBeInTheDocument();
    expect(screen.getByLabelText('掲示板用案内文')).toHaveValue('点検中です');
    expect(screen.getByLabelText('連絡先')).toHaveValue('092-000-0000');
    expect(screen.getByTestId('template-name')).toHaveTextContent('消防設備点検（テンプレ）');
    expect(screen.getByRole('button', { name: /表示期間/ })).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByLabelText('表示開始日')).not.toBeInTheDocument();

    // 畳んだまま保存しても表示期間は行の値（空）のまま。連絡先が既定のままなら行には持たない
    fireEvent.click(screen.getByRole('button', { name: '保存' }));
    expect(rowOf(id)).toMatchObject({ displayStartDate: '', displayEndDate: '', emergencyContact: '', posterType: 'template' });
  });

  it('表示期間を開くと点検期間が入り、書き換えた連絡先と画面図で選んだ位置を保存する', () => {
    const id = setup();
    fireEvent.click(screen.getByRole('button', { name: /表示期間/ }));
    expect(screen.getByLabelText('表示開始日')).toHaveValue('2026-11-02');
    fireEvent.change(screen.getByLabelText('連絡先'), { target: { value: '03-1111-2222' } });
    fireEvent.click(screen.getByRole('radio', { name: /④中央/ }));
    expect(screen.getByRole('radio', { name: /④中央/ })).toBeChecked();
    fireEvent.click(screen.getByRole('button', { name: '保存' }));
    expect(rowOf(id)).toMatchObject({
      displayStartDate: '2026-11-02',
      displayEndDate: '2026-11-03',
      emergencyContact: '03-1111-2222',
      position: 4,
    });
  });

  it('追加の貼紙は選んだ時点でアップロードして URL を行に保存し、複数ページの PDF は1ページ目を使うと知らせる', async () => {
    const id = setup();
    const png = new File(['x'], 'poster.png', { type: 'image/png' });
    io.preparePosterImage.mockResolvedValue({ file: png, notice: 'PDF は3ページあります。1ページ目を使用します' });
    io.uploadPosterImage.mockResolvedValue('https://storage/poster-images/user-1/1_ab.png');

    fireEvent.click(screen.getByRole('radio', { name: '追加' }));
    // 画像を選ぶ前は保存できない
    fireEvent.click(screen.getByRole('button', { name: '保存' }));
    expect(await screen.findByText('追加の貼紙画像を選択してください')).toBeInTheDocument();
    expect(rowOf(id).posterType).toBe('template');

    const pdf = new File(['%PDF'], 'poster.pdf', { type: 'application/pdf' });
    fireEvent.change(screen.getByLabelText('貼紙画像'), { target: { files: [pdf] } });
    await waitFor(() => expect(io.uploadPosterImage).toHaveBeenCalledWith(png, 'user-1'));
    expect(io.preparePosterImage).toHaveBeenCalledWith(pdf);
    expect(await screen.findByText(/1ページ目を使用します/)).toBeInTheDocument();
    expect(screen.getByAltText('追加の貼紙')).toHaveAttribute('src', 'https://storage/poster-images/user-1/1_ab.png');

    fireEvent.click(screen.getByRole('button', { name: '保存' }));
    expect(rowOf(id)).toMatchObject({
      posterType: 'custom',
      posterImage: 'https://storage/poster-images/user-1/1_ab.png',
      isValid: true,
    });
  });
});
