import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, act, fireEvent } from '@testing-library/react';
import { ToastProvider, useToast } from '../Toast';
import { pushTopLayerHost, removeTopLayerHost } from '../topLayerHost';

function Trigger() {
  const { addToast } = useToast();
  return (
    <button onClick={() => [1, 2, 3, 4, 5].forEach((n) => addToast(`通知${n}`))}>
      送る
    </button>
  );
}

function Send({ message, type }: { message: string; type: 'info' | 'success' | 'error' | 'warning' }) {
  const { addToast } = useToast();
  return <button onClick={() => addToast(message, type)}>{type}</button>;
}

afterEach(() => {
  vi.useRealTimers();
});

describe('ToastProvider', () => {
  it('積み重なっても最新の3件だけを表示する', () => {
    render(
      <ToastProvider>
        <Trigger />
      </ToastProvider>,
    );
    act(() => screen.getByText('送る').click());
    expect(screen.queryByText('通知1')).toBeNull();
    expect(screen.queryByText('通知2')).toBeNull();
    expect(screen.getByText('通知3')).toBeTruthy();
    expect(screen.getByText('通知5')).toBeTruthy();
  });

  it('成功は4秒で消え、エラーは × を押すまで残る。改行は whitespace-pre-line で出す', () => {
    vi.useFakeTimers();
    render(
      <ToastProvider>
        <Send message="保存しました" type="success" />
        <Send message={'保存できません\n理由: 重複'} type="error" />
      </ToastProvider>,
    );
    act(() => screen.getByText('success').click());
    act(() => screen.getByText('error').click());
    const errorText = screen.getByText(/保存できません/);
    expect(errorText).toHaveClass('whitespace-pre-line');
    expect(errorText.textContent).toBe('保存できません\n理由: 重複');

    act(() => vi.advanceTimersByTime(10000));
    expect(screen.queryByText('保存しました')).toBeNull();
    expect(screen.getByText(/保存できません/)).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: '閉じる' }));
    expect(screen.queryByText(/保存できません/)).toBeNull();
  });

  it('一番手前の dialog の中に出し、dialog が外れたら（DOM から切り離されていても）body へ戻る', () => {
    render(
      <ToastProvider>
        <Send message="入力に誤りがあります" type="error" />
      </ToastProvider>,
    );
    const dialog = document.createElement('dialog');
    document.body.appendChild(dialog);
    act(() => pushTopLayerHost(dialog));
    act(() => screen.getByText('error').click());
    expect(dialog.contains(screen.getByText('入力に誤りがあります'))).toBe(true);

    // Modal が unmount されたときと同じく、先に DOM から外れてから host が消える
    dialog.remove();
    act(() => removeTopLayerHost(dialog));
    const text = screen.getByText('入力に誤りがあります');
    expect(dialog.contains(text)).toBe(false);
    expect(document.body.contains(text)).toBe(true);
  });
});
