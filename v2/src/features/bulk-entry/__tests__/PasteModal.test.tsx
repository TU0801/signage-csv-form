import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup, waitFor } from '@testing-library/react';
import { ToastProvider } from '@/components/ui/Toast';
import { PasteModal } from '../modals/PasteModal';

const onDownloadTemplate = vi.fn(async () => {});

beforeEach(() => {
  // jsdom の <dialog> は showModal/close を持たない。開いた状態にして中身を読めるようにする
  HTMLDialogElement.prototype.showModal ??= function (this: HTMLDialogElement) {
    this.open = true;
  };
  HTMLDialogElement.prototype.close ??= function (this: HTMLDialogElement) {
    this.open = false;
  };
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

const renderModal = () =>
  render(
    <ToastProvider>
      <PasteModal open onClose={() => {}} onImport={() => true} onDownloadTemplate={onDownloadTemplate} />
    </ToastProvider>,
  );

describe('PasteModal（Excel 取込）', () => {
  it('『テンプレートDL』で画面の一括入力テンプレート（担当の物件入り）を出す（修正依頼1027 (2)）', async () => {
    renderModal();
    fireEvent.click(screen.getByRole('button', { name: 'テンプレートDL' }));
    await waitFor(() => expect(onDownloadTemplate).toHaveBeenCalledTimes(1));
  });

  it('列一覧は A〜E で、備考欄に作業時間の書き方を出し、端末ID の注記は無い', () => {
    renderModal();
    expect(screen.getAllByRole('columnheader').map((th) => th.textContent)).toEqual(['A列', 'B列', 'C列', 'D列', 'E列']);
    expect(screen.getByText('作業時間を記載下さい（例: 10:00～12:00 / No2号機11:00～12:00）')).toBeTruthy();
    expect(screen.queryByText(/端末ID/)).toBeNull();
  });
});
