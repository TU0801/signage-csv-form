import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { PropertyRequestRow } from '../components/PropertyRequestsList';

vi.mock('@/lib/supabase', () => ({ supabase: {}, TABLES: {}, RPC: {} }));
vi.mock('@/components/ui/Toast', () => ({ useToast: () => ({ addToast: vi.fn() }) }));

import { ApproveDialog, RejectDialog } from '../components/PropertyRequestsList';

beforeEach(() => {
  HTMLDialogElement.prototype.showModal ??= function () {};
  HTMLDialogElement.prototype.close ??= function () {};
});

const target = {
  id: 'r1',
  property_name: '新築マンション',
  managementCompanyName: '管理X',
  vendorName: '保守A',
  inspectionTypeName: 'エレベーター',
  inspection_type_id: 't1',
  inspection_months: [4, 10],
} as PropertyRequestRow;

describe('新規建物の申請の承認・却下', () => {
  it('承認は物件コードの形を確かめてから送り、DB が返した理由（重複など）をその場に出す', async () => {
    const onConfirm = vi.fn(async (code: string) => {
      if (code === '120410') throw { message: '物件コード「120410」は既に使われています' };
    });
    render(<ApproveDialog target={target} onClose={vi.fn()} onConfirm={onConfirm} />);
    // できる物件には端末が無く、端末を登録するまでは申請してもサイネージに出ないことを承認前に知らせる（F7）
    expect(screen.getByTestId('propertyRequestTerminalNote')).toHaveTextContent('申請してもサイネージには表示されません');
    const input = document.getElementById('propertyRequestCode')!;
    const submit = screen.getByRole('button', { name: '物件を登録して承認', hidden: true });

    fireEvent.change(input, { target: { value: 'テスト 1' } });
    fireEvent.click(submit);
    expect(onConfirm).not.toHaveBeenCalled();
    expect(screen.getByText(/英数字・ハイフン・アンダーバーの32文字以内/)).toBeInTheDocument();

    fireEvent.change(input, { target: { value: ' 120410 ' } });
    fireEvent.click(submit);
    await waitFor(() => expect(onConfirm).toHaveBeenCalledWith('120410', null));
    expect(await screen.findByText('物件コード「120410」は既に使われています')).toBeInTheDocument();
  });

  it('端末番号（任意）は形を確かめてから物件コードと一緒に送り、入れたら端末未設置の注意を登録の案内に変える', async () => {
    const onConfirm = vi.fn(async () => {});
    render(<ApproveDialog target={target} onClose={vi.fn()} onConfirm={onConfirm} />);
    fireEvent.change(document.getElementById('propertyRequestCode')!, {
      target: { value: 'RV-03' },
    });
    const terminal = document.getElementById('propertyRequestTerminal')!;
    const submit = screen.getByRole('button', { name: '物件を登録して承認', hidden: true });

    fireEvent.change(terminal, { target: { value: 'Z0090A01' } });
    fireEvent.click(submit);
    expect(onConfirm).not.toHaveBeenCalled();
    expect(
      screen.getByText(/端末番号は「英小文字1字＋数字4桁＋英大文字1字＋数字2桁」/),
    ).toBeInTheDocument();

    fireEvent.change(terminal, { target: { value: ' z0090A01 ' } });
    const note = screen.getByTestId('propertyRequestTerminalNote');
    expect(note).toHaveTextContent('端末「z0090A01」を業務システムの物件に登録します');
    expect(note).not.toHaveTextContent('表示されません');
    fireEvent.click(submit);
    await waitFor(() => expect(onConfirm).toHaveBeenCalledWith('RV-03', 'z0090A01'));
  });

  it('却下は理由が無いと送らない', async () => {
    const onConfirm = vi.fn(async () => {});
    render(<RejectDialog target={target} onClose={vi.fn()} onConfirm={onConfirm} />);
    const submit = screen.getByRole('button', { name: '却下する', hidden: true });
    fireEvent.click(submit);
    expect(onConfirm).not.toHaveBeenCalled();
    expect(screen.getByText('却下の理由を入力してください')).toBeInTheDocument();

    fireEvent.change(document.getElementById('propertyRequestRejectReason')!, {
      target: { value: '既存物件と重複' },
    });
    fireEvent.click(submit);
    await waitFor(() => expect(onConfirm).toHaveBeenCalledWith('既存物件と重複'));
  });
});
