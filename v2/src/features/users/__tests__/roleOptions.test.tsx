import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
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
  it('管理者は選べず、管理会社を選ぶと会社は自社に固定して出す', () => {
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
    expect(optionLabels(select)).toEqual(['保守会社', '管理会社']);
    // 保守会社の欄の説明（自社物件の担当だけ）
    expect(screen.getByText(/自社が管理する物件を担当する保守会社だけ/, { selector: 'p' })).toBeInTheDocument();
    fireEvent.change(select, { target: { value: 'management' } });
    expect(document.getElementById('newUserManagementCompany')).toHaveTextContent('自社管理');
  });
});
