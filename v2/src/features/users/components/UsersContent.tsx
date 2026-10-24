import { useState } from 'react';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { Spinner } from '@/components/ui/Spinner';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { useToast } from '@/components/ui/Toast';
import { useUsers } from '../hooks/useUsers';
import { AddUserModal } from './AddUserModal';
import { EditUserModal } from './EditUserModal';
import { roleLabel } from '../constants';
import type { DbProfile, DbVendor } from '@/types/database';
import type { ManagementCompanyRow } from '@/types/portal';

/** 保守会社名。見つからなければ ID を出す（v1: js/admin-users.js loadUsers） */
function vendorLabel(vendorId: string | null, vendors: DbVendor[]): string {
  if (!vendorId) return '-';
  const vendor = vendors.find((v) => String(v.id) === String(vendorId));
  return vendor ? vendor.vendor_name : `Unknown (ID:${vendorId})`;
}

/** 会社の列。管理会社アカウントは管理会社名（management_companies_master の結果から引く）、それ以外は保守会社名 */
function companyLabel(user: DbProfile, vendors: DbVendor[], managementCompanies: ManagementCompanyRow[]): string {
  if (user.role !== 'management') return vendorLabel(user.vendor_id, vendors);
  if (!user.management_company_id) return '-';
  const company = managementCompanies.find((c) => c.id === user.management_company_id);
  return company ? company.name : `Unknown (ID:${user.management_company_id})`;
}

const ROLE_BADGE: Record<DbProfile['role'], 'danger' | 'primary' | 'default'> = {
  admin: 'danger',
  management: 'primary',
  user: 'default',
};

// v1: js/admin-users.js loadUsers（admin.html #tab-users）
export function UsersContent() {
  const { addToast } = useToast();
  const {
    users,
    vendors,
    managementCompanies,
    currentUserId,
    isManagement,
    loading,
    error,
    addUser,
    editUser,
    updateUserStatus,
  } = useUsers();

  const [showAddModal, setShowAddModal] = useState(false);
  const [editTarget, setEditTarget] = useState<DbProfile | null>(null);
  const [deactivateTarget, setDeactivateTarget] = useState<DbProfile | null>(null);

  // v1: js/admin-users.js handleDeactivateUser
  const handleDeactivate = async (user: DbProfile) => {
    try {
      await updateUserStatus(user.id, 'inactive');
      addToast('ユーザーを無効化しました', 'success');
    } catch (err) {
      console.error('Failed to deactivate user:', err);
      addToast('無効化に失敗しました', 'error');
    }
  };

  // v1: js/admin-users.js handleActivateUser（確認なし）
  const handleActivate = async (user: DbProfile) => {
    try {
      await updateUserStatus(user.id, 'active');
      addToast('ユーザーを有効化しました', 'success');
    } catch (err) {
      console.error('Failed to activate user:', err);
      addToast('有効化に失敗しました', 'error');
    }
  };

  if (loading && users.length === 0) {
    return (
      <div className="flex justify-center py-12">
        <Spinner />
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h1 className="text-base font-bold text-gray-900">ユーザー管理</h1>
        <Button onClick={() => setShowAddModal(true)} size="sm">
          ユーザー追加
        </Button>
      </div>

      {isManagement && (
        <p className="text-xs text-gray-500">
          自社の管理会社ユーザーと、自社が管理する物件を担当する保守会社のユーザーを表示します。
          編集・無効化できるのは自社の管理会社ユーザーだけです（保守会社のユーザーは複数の管理会社にまたがるため閲覧のみ）。
        </p>
      )}

      {error && <p className="text-sm text-red-600">{error}</p>}

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-200 text-left">
              <th className="cell-head font-medium text-gray-700">メールアドレス</th>
              <th className="cell-head font-medium text-gray-700">保守会社／管理会社</th>
              <th className="cell-head font-medium text-gray-700">権限</th>
              <th className="cell-head font-medium text-gray-700">ステータス</th>
              <th className="cell-head font-medium text-gray-700">登録日</th>
              <th className="cell-head font-medium text-gray-700 sticky right-0 bg-white shadow-[inset_1px_0_0_var(--color-gray-200)]">操作</th>
            </tr>
          </thead>
          <tbody>
            {users.length === 0 ? (
              <tr>
                <td colSpan={6} className="py-8 text-center text-gray-400">
                  ユーザーが登録されていません
                </td>
              </tr>
            ) : (
              users.map((user) => {
                const isSelf = currentUserId === user.id;
                // 管理会社は自社の管理会社ユーザーだけを編集・無効化できる（一覧に出る管理会社ユーザーは自社のものだけ）
                const readOnly = isManagement && user.role !== 'management';
                const status = user.status || 'active';
                const company = companyLabel(user, vendors, managementCompanies);
                return (
                  <tr key={user.id} className="group border-b border-gray-100 hover:bg-gray-50">
                    <td className="cell whitespace-nowrap">
                      {user.email}
                      {isSelf && ' (自分)'}
                    </td>
                    <td className="cell">
                      <div className="max-w-[16rem] truncate" title={company}>
                        {company}
                      </div>
                    </td>
                    <td className="cell whitespace-nowrap">
                      <Badge variant={ROLE_BADGE[user.role] ?? 'default'}>{roleLabel(user.role)}</Badge>
                    </td>
                    <td className="cell whitespace-nowrap">
                      <Badge variant={status === 'active' ? 'success' : 'default'}>
                        {status === 'active' ? '有効' : '無効'}
                      </Badge>
                    </td>
                    <td className="cell whitespace-nowrap">
                      {user.created_at ? new Date(user.created_at).toLocaleDateString('ja-JP') : '-'}
                    </td>
                    <td className="cell sticky right-0 bg-white shadow-[inset_1px_0_0_var(--color-gray-200)] group-hover:bg-gray-50">
                      {/* 削除は無い（v1 にも無く、profiles に DELETE ポリシーも無い。使わせないときは無効化する） */}
                      {/* flex は td ではなく中の div に付ける（td に付けると表のセルとして並ばなくなる） */}
                      {readOnly ? (
                        <span className="text-xs text-gray-400" title="保守会社のユーザーは管理者が編集します">
                          閲覧のみ
                        </span>
                      ) : (
                        <div className="-my-0.5 flex gap-1">
                          <Button
                            variant="ghost"
                            size="sm"
                            disabled={isSelf}
                            title={isSelf ? '自分は編集できません' : undefined}
                            onClick={() => setEditTarget(user)}
                          >
                            編集
                          </Button>
                          {!isSelf && status === 'active' && (
                            <Button variant="danger" size="sm" onClick={() => setDeactivateTarget(user)}>
                              無効化
                            </Button>
                          )}
                          {!isSelf && status === 'inactive' && (
                            <Button variant="success" size="sm" onClick={() => handleActivate(user)}>
                              有効化
                            </Button>
                          )}
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      <AddUserModal
        open={showAddModal}
        onClose={() => setShowAddModal(false)}
        vendors={vendors}
        managementCompanies={managementCompanies}
        onAdd={addUser}
        managementCaller={isManagement}
      />

      <EditUserModal
        open={!!editTarget}
        onClose={() => setEditTarget(null)}
        user={editTarget}
        vendors={vendors}
        managementCompanies={managementCompanies}
        onUpdate={editUser}
        passwordOnly={isManagement}
      />

      <ConfirmDialog
        open={!!deactivateTarget}
        onClose={() => setDeactivateTarget(null)}
        onConfirm={() => {
          if (deactivateTarget) handleDeactivate(deactivateTarget);
        }}
        title="ユーザーの無効化"
        message={"このユーザーを無効化してもよろしいですか？\nログインできなくなります。"} // v1: js/admin-users.js handleDeactivateUser
        confirmLabel="無効化"
        variant="danger"
      />
    </div>
  );
}
