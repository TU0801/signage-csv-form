import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { EditUserModal } from '../components/EditUserModal';
import type { DbProfile } from '@/types/database';

vi.mock('@/components/ui/Toast', () => ({ useToast: () => ({ addToast: vi.fn() }) }));

beforeEach(() => {
  // jsdom には <dialog> の showModal / close が無い
  HTMLDialogElement.prototype.showModal ??= function () {};
  HTMLDialogElement.prototype.close ??= function () {};
});

const vendorUser: DbProfile = {
  id: 'u1',
  email: 'u1@example.com',
  role: 'user',
  vendor_id: 'v1',
  management_company_id: null,
  status: 'active',
  created_at: '2026-09-13T02:00:00+00:00',
} as DbProfile;

describe('ユーザー編集で保守会社→管理会社へ付け替える', () => {
  it('管理会社を選ぶと保守会社の欄が管理会社の欄に替わり、付け替えの注意が出る', () => {
    render(
      <EditUserModal
        open
        onClose={vi.fn()}
        user={vendorUser}
        vendors={[{ id: 'v1', vendor_name: '保守A' } as never]}
        managementCompanies={[{ id: 'm1', name: '管理A' }]}
        onUpdate={vi.fn()}
      />,
    );
    expect(document.getElementById('editUserVendor')).not.toBeNull();
    expect(screen.queryByRole('note')).toBeNull();

    fireEvent.change(document.getElementById('editUserRole')!, { target: { value: 'management' } });

    expect(document.getElementById('editUserVendor')).toBeNull();
    expect(document.getElementById('editUserManagementCompany')).not.toBeNull();
    expect(screen.getByRole('note', { hidden: true })).toHaveTextContent('申請の作成');
    // 付け替え後に使える画面（管理会社メニューを開いた今の機能。F13）
    expect(screen.getByRole('note', { hidden: true })).toHaveTextContent('管理会社メニュー');
  });
});
