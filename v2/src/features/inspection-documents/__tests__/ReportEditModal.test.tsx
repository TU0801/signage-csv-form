import { beforeAll, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { makeReport } from './fixtures';

vi.mock('@/lib/api/portal', () => ({ updateInspectionReport: vi.fn() }));
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
  it('規則どおりの名前（DB が付けた _2 を含む）は、実施日を変えると黙って作り直す', () => {
    const { date, name } = setup('20261005_テスト第一ビル_消防設備点検_2.pdf');
    fireEvent.change(date, { target: { value: '2026-10-07' } });
    expect(name.value).toBe('20261007_テスト第一ビル_消防設備点検.pdf');
  });

  it('手で直した名前は残し、作り直すかを確かめてから作り直す', () => {
    const { date, name } = setup('点検結果_手書き.pdf');
    fireEvent.change(date, { target: { value: '2026-10-07' } });
    expect(name.value).toBe('点検結果_手書き.pdf');
    expect(screen.getByRole('status')).toHaveTextContent('作り直しますか');
    fireEvent.click(screen.getByRole('button', { name: '作り直す' }));
    expect(name.value).toBe('20261007_テスト第一ビル_消防設備点検.pdf');
  });
});
