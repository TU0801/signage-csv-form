import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup, waitFor } from '@testing-library/react';
import { ToastProvider } from '@/components/ui/Toast';
import { PasteModal } from '../modals/PasteModal';

const xlsx = vi.hoisted(() => ({
  aoa: vi.fn((rows: string[][]) => ({ rows }) as Record<string, unknown>),
  writeFile: vi.fn(),
}));
vi.mock('xlsx', () => ({
  utils: {
    aoa_to_sheet: xlsx.aoa,
    book_new: () => ({ sheets: [] as unknown[] }),
    book_append_sheet: (wb: { sheets: unknown[] }, ws: unknown) => wb.sheets.push(ws),
  },
  writeFile: xlsx.writeFile,
}));

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
      <PasteModal open onClose={() => {}} onImport={() => true} />
    </ToastProvider>,
  );

describe('PasteModal（Excel 取込）', () => {
  it('『テンプレート書式DL』で一括入力テンプレート.xlsx（5列）を出す', async () => {
    renderModal();
    fireEvent.click(screen.getByRole('button', { name: 'テンプレート書式DL' }));
    await waitFor(() => expect(xlsx.writeFile).toHaveBeenCalledTimes(1));
    expect(xlsx.writeFile.mock.calls[0]![1]).toBe('一括入力テンプレート.xlsx');
    expect(xlsx.aoa.mock.calls[0]![0][0]).toEqual(['物件名', '点検種別', '開始日', '終了日', '備考']);
  });

  it('列一覧は A〜E で、備考欄に作業時間の書き方を出し、端末ID の注記は無い', () => {
    renderModal();
    expect(screen.getAllByRole('columnheader').map((th) => th.textContent)).toEqual(['A列', 'B列', 'C列', 'D列', 'E列']);
    expect(screen.getByText('作業時間を記載下さい（例: 10:00～12:00 / No2号機11:00～12:00）')).toBeTruthy();
    expect(screen.queryByText(/端末ID/)).toBeNull();
  });
});
