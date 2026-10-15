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

describe('Modal の dirty（保存していない変更）', () => {
  const bar = () => screen.queryByText('保存していない変更があります。破棄して閉じますか？');

  it('Escape・背景・× では閉じずに確認を出し、破棄して閉じるで onClose', () => {
    const onClose = vi.fn();
    render(
      <Modal open dirty onClose={onClose} title="編集">
        <input aria-label="名前" />
      </Modal>,
    );
    const dialog = screen.getByText('編集').closest('dialog')!;
    const back = () => fireEvent.click(screen.getByRole('button', { name: '編集に戻る', hidden: true }));

    const cancel = new Event('cancel', { cancelable: true });
    fireEvent(dialog, cancel);
    expect(cancel.defaultPrevented).toBe(true);
    expect(bar()).not.toBeNull();
    back();
    expect(bar()).toBeNull();

    fireEvent.mouseDown(dialog);
    fireEvent.click(dialog);
    expect(bar()).not.toBeNull();
    back();

    fireEvent.click(screen.getByRole('button', { name: '閉じる', hidden: true }));
    expect(bar()).not.toBeNull();
    expect(onClose).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: '破棄して閉じる', hidden: true }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('dirty でなければ × ですぐ閉じる', () => {
    const onClose = vi.fn();
    render(
      <Modal open onClose={onClose} title="編集">
        <p>本文</p>
      </Modal>,
    );
    fireEvent.click(screen.getByRole('button', { name: '閉じる', hidden: true }));
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(bar()).toBeNull();
  });

  it('開くと data-autofocus、無ければ最初の入力欄にフォーカスする', () => {
    const { rerender } = render(
      <Modal open onClose={() => {}} title="編集">
        <input type="hidden" />
        <input aria-label="一つ目" />
      </Modal>,
    );
    expect(screen.getByRole('textbox', { name: '一つ目', hidden: true })).toHaveFocus();
    rerender(
      <Modal open={false} onClose={() => {}} title="編集">
        <input aria-label="一つ目" />
      </Modal>,
    );
    rerender(
      <Modal open onClose={() => {}} title="編集">
        <input aria-label="一つ目" />
        <textarea aria-label="二つ目" data-autofocus />
      </Modal>,
    );
    expect(screen.getByRole('textbox', { name: '二つ目', hidden: true })).toHaveFocus();
  });
});
