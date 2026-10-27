import { beforeAll, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { makeReport } from './fixtures';

const api = vi.hoisted(() => ({
  updateInspectionReport: vi.fn(),
  downloadReportBlob: vi.fn(async () => new Blob(['%PDF-1.4'], { type: 'application/pdf' })),
}));
vi.mock('@/lib/api/portal', () => api);
// jsdom には canvas の描画が無いので、プレビューの pdfjs は差し替える
vi.mock('../lib/pdfPages', () => ({
  openPdfPages: vi.fn(async () => ({ pageCount: 1, render: vi.fn(async () => {}), pageTexts: vi.fn(async () => []), destroy: vi.fn() })),
}));
vi.mock('@/lib/supabase', () => ({ supabase: {}, TABLES: {}, RPC: {} }));
vi.mock('@/components/ui/Toast', () => ({ useToast: () => ({ addToast: vi.fn() }) }));

import { ReportEditModal } from '../components/ReportEditModal';

beforeAll(() => {
  // jsdom には <dialog> の showModal / close が無い
  HTMLDialogElement.prototype.showModal = function (this: HTMLDialogElement) {
    this.setAttribute('open', '');
  };
  HTMLDialogElement.prototype.close = function (this: HTMLDialogElement) {
    this.removeAttribute('open');
  };
});

function setup(fileName: string) {
  render(<ReportEditModal report={makeReport({ file_name: fileName })} onClose={vi.fn()} onSaved={vi.fn()} />);
  return {
    date: screen.getByLabelText('実施日') as HTMLInputElement,
    name: screen.getByLabelText('ファイル名') as HTMLInputElement,
  };
}

describe('ReportEditModal（実施日とファイル名）', () => {
  it('登録済みのファイルをプレビューに出す（建物の取り違えに気づけるように。修正依頼1027(2)）', async () => {
    setup('20261005_テスト第一ビル_消防設備点検.pdf');
    await waitFor(() => expect(screen.getByLabelText('1ページ目')).toBeInTheDocument());
    expect(api.downloadReportBlob).toHaveBeenCalledWith(expect.objectContaining({ storage_path: 'pi1/u1.pdf' }));
  });

  it('規則どおりの名前（DB が付けた _2 を含む）は、実施日を変えると黙って作り直す', () => {
    const { date, name } = setup('20261005_テスト第一ビル_消防設備点検_2.pdf');
    fireEvent.change(date, { target: { value: '2026-10-07' } });
    expect(name.value).toBe('20261007_テスト第一ビル_消防設備点検.pdf');
  });

  it('手で直した名前は残し、作り直すかを確かめてから作り直す', () => {
    const { date, name } = setup('点検結果_手書き.pdf');
    fireEvent.change(date, { target: { value: '2026-10-07' } });
    expect(name.value).toBe('点検結果_手書き.pdf');
    // プレビューの読み込み中の表示（Spinner）も status なので、文言で選ぶ
    expect(screen.getAllByRole('status').some((el) => el.textContent?.includes('作り直しますか'))).toBe(true);
    fireEvent.click(screen.getByRole('button', { name: '作り直す' }));
    expect(name.value).toBe('20261007_テスト第一ビル_消防設備点検.pdf');
  });
});
