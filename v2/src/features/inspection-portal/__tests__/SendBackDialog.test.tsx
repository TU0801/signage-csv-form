import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { SendBackDialog } from '../components/SendBackDialog';

beforeEach(() => {
  // jsdom の <dialog> は showModal/close を持たない。開いた状態にして中身を読めるようにする
  HTMLDialogElement.prototype.showModal ??= function (this: HTMLDialogElement) {
    this.open = true;
  };
  HTMLDialogElement.prototype.close ??= function (this: HTMLDialogElement) {
    this.open = false;
  };
});

describe('SendBackDialog（申請の差戻し）', () => {
  it('理由が空なら差し戻さず、入力を求める。理由があれば前後の空白を除いて渡す', async () => {
    const onConfirm = vi.fn(async () => {});
    const onClose = vi.fn();
    render(<SendBackDialog open subject="2026年11月・テスト" onClose={onClose} onConfirm={onConfirm} />);

    fireEvent.change(screen.getByLabelText('差戻しの理由 *'), { target: { value: '   ' } });
    fireEvent.click(screen.getByRole('button', { name: '差し戻す' }));
    expect(screen.getByText('差戻しの理由を入力してください')).toBeInTheDocument();
    expect(onConfirm).not.toHaveBeenCalled();

    fireEvent.change(screen.getByLabelText('差戻しの理由 *'), { target: { value: ' 点検日が違います ' } });
    fireEvent.click(screen.getByRole('button', { name: '差し戻す' }));
    await waitFor(() => expect(onConfirm).toHaveBeenCalledWith('点検日が違います'));
    await waitFor(() => expect(onClose).toHaveBeenCalled());
  });
});
