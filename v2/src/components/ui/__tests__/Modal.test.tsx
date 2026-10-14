import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { Modal } from '../Modal';

beforeEach(() => {
  // jsdom には <dialog> の showModal / close が無い
  HTMLDialogElement.prototype.showModal ??= function () {};
  HTMLDialogElement.prototype.close ??= function () {};
});

describe('Modal', () => {
  it('背景（dialog 自身）のクリックで閉じ、中身のクリックでは閉じない（v1 の各モーダルの overlay click）', () => {
    const onClose = vi.fn();
    render(
      <Modal open onClose={onClose} title="確認">
        <p>本文</p>
      </Modal>,
    );
    fireEvent.click(screen.getByText('本文'));
    fireEvent.click(screen.getByRole('heading', { name: '確認', hidden: true }));
    expect(onClose).not.toHaveBeenCalled();

    const dialog = screen.getByText('本文').closest('dialog')!;
    // 中で押して背景で離した（文字の選択など）ときは閉じない
    fireEvent.mouseDown(screen.getByText('本文'));
    fireEvent.click(dialog);
    expect(onClose).not.toHaveBeenCalled();

    fireEvent.mouseDown(dialog);
    fireEvent.click(dialog);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('中央に置き（m-auto）、呼び出し側の max-w-* があれば既定の max-w-lg を付けない', () => {
    const { rerender } = render(<Modal open onClose={() => {}}><p>本文</p></Modal>);
    const dialog = () => screen.getByText('本文').closest('dialog')!;
    expect(dialog()).toHaveClass('m-auto', 'max-w-lg');
    rerender(<Modal open onClose={() => {}} className="max-w-4xl"><p>本文</p></Modal>);
    expect(dialog()).toHaveClass('m-auto', 'max-w-4xl');
    expect(dialog()).not.toHaveClass('max-w-lg');
  });
});
