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
    const input = document.getElementById('propertyRequestCode')!;
    const submit = screen.getByRole('button', { name: '物件を登録して承認', hidden: true });

    fireEvent.change(input, { target: { value: 'テスト 1' } });
    fireEvent.click(submit);
    expect(onConfirm).not.toHaveBeenCalled();
    expect(screen.getByText(/英数字・ハイフン・アンダーバーの32文字以内/)).toBeInTheDocument();

    fireEvent.change(input, { target: { value: ' 120410 ' } });
    fireEvent.click(submit);
    await waitFor(() => expect(onConfirm).toHaveBeenCalledWith('120410'));
    expect(await screen.findByText('物件コード「120410」は既に使われています')).toBeInTheDocument();
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
