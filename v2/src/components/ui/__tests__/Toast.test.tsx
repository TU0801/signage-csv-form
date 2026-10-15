import { describe, it, expect } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import { ToastProvider, useToast } from '../Toast';

function Trigger() {
  const { addToast } = useToast();
  return (
    <button onClick={() => [1, 2, 3, 4, 5].forEach((n) => addToast(`通知${n}`))}>
      送る
    </button>
  );
}

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
});
