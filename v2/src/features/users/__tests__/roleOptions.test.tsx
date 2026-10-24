import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { AddUserModal } from '../components/AddUserModal';
import { roleLabel } from '../constants';

vi.mock('@/components/ui/Toast', () => ({ useToast: () => ({ addToast: vi.fn() }) }));

beforeEach(() => {
  // jsdom には <dialog> の showModal / close が無い
  HTMLDialogElement.prototype.showModal ??= function () {};
  HTMLDialogElement.prototype.close ??= function () {};
});

const optionLabels = (select: HTMLElement) =>
  within(select).getAllByRole('option', { hidden: true }).map((o) => o.textContent);

describe('権限の表示名（修正依頼1024 C4）', () => {
  it("role 'user' は「保守会社」と表示する（DB の値は 'user' のまま）", () => {
    expect(roleLabel('user')).toBe('保守会社');
    render(<AddUserModal open onClose={vi.fn()} vendors={[]} managementCompanies={[]} onAdd={vi.fn()} />);
    const select = document.getElementById('newUserRole')!;
    expect(optionLabels(select)).toEqual(['保守会社', '管理者', '管理会社']);
    expect((select as HTMLSelectElement).value).toBe('user');
  });
});

describe('管理会社のアカウントのユーザー追加（修正依頼1024 C3）', () => {
  it('作れる権限は管理会社だけ（管理者・保守会社は選べない）で、会社は自社に固定して出す', () => {
    render(
      <AddUserModal
        open
        onClose={vi.fn()}
        vendors={[]}
        managementCompanies={[{ id: 'm1', name: '自社管理' }]}
        onAdd={vi.fn()}
        managementCaller
      />,
    );
    const select = document.getElementById('newUserRole') as HTMLSelectElement;
    expect(optionLabels(select)).toEqual(['管理会社']);
    expect(select.value).toBe('management');
    expect(document.getElementById('newUserManagementCompany')).toHaveTextContent('自社管理');
    // 保守会社の選択欄は出さない
    expect(document.getElementById('newUserVendor')).toBeNull();
  });

  it('送信すると権限 management・自社の会社で作成する（保守会社は付けない）', async () => {
    const onAdd = vi.fn().mockResolvedValue(undefined);
    render(
      <AddUserModal
        open
        onClose={vi.fn()}
        vendors={[]}
        managementCompanies={[{ id: 'm1', name: '自社管理' }]}
        onAdd={onAdd}
        managementCaller
      />,
    );
    fireEvent.change(document.getElementById('newUserEmail')!, { target: { value: 'new@example.com' } });
    fireEvent.change(document.getElementById('newUserPassword')!, { target: { value: 'secret1' } });
    fireEvent.click(screen.getByRole('button', { name: '追加', hidden: true }));
    await waitFor(() =>
      expect(onAdd).toHaveBeenCalledWith({
        email: 'new@example.com',
        password: 'secret1',
        role: 'management',
        vendor_id: null,
        management_company_id: 'm1',
      }),
    );
  });
});
