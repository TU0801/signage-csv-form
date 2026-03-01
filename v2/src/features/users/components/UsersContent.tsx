import { useState } from 'react';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { Spinner } from '@/components/ui/Spinner';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { useToast } from '@/components/ui/Toast';
import { useMasterData } from '@/hooks/useMasterData';
import { useUsers } from '../hooks/useUsers';
import { AddUserModal } from './AddUserModal';
import { EditUserModal } from './EditUserModal';
import type { DbProfile } from '@/types/database';

export function UsersContent() {
  const { addToast } = useToast();
  const { vendors } = useMasterData();
  const { users, loading, addUser, updateUser, deleteUser } = useUsers();

  const [showAddModal, setShowAddModal] = useState(false);
  const [editTarget, setEditTarget] = useState<DbProfile | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);

  const vendorMap = new Map(vendors.map((v) => [v.id, v.vendor_name]));

  const handleDelete = async () => {
    if (!deleteTarget) return;
    try {
      await deleteUser(deleteTarget);
      addToast('ユーザーを削除しました', 'success');
    } catch (err) {
      addToast(err instanceof Error ? err.message : '削除に失敗しました', 'error');
    } finally {
      setDeleteTarget(null);
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center py-12">
        <Spinner />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold text-gray-900">ユーザー管理</h1>
        <Button onClick={() => setShowAddModal(true)} size="sm">
          ユーザー追加
        </Button>
      </div>

      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-gray-200 text-left">
            <th className="py-2 px-3 font-medium text-gray-700">メール</th>
            <th className="py-2 px-3 font-medium text-gray-700">役割</th>
            <th className="py-2 px-3 font-medium text-gray-700">保守会社</th>
            <th className="py-2 px-3 font-medium text-gray-700">操作</th>
          </tr>
        </thead>
        <tbody>
          {users.length === 0 ? (
            <tr>
              <td colSpan={4} className="py-8 text-center text-gray-400">
                ユーザーが登録されていません
              </td>
            </tr>
          ) : (
            users.map((user) => (
              <tr key={user.id} className="border-b border-gray-100 hover:bg-gray-50">
                <td className="py-2 px-3">{user.email}</td>
                <td className="py-2 px-3">
                  <Badge variant={user.role === 'admin' ? 'danger' : 'default'}>
                    {user.role === 'admin' ? '管理者' : 'ユーザー'}
                  </Badge>
                </td>
                <td className="py-2 px-3">
                  {user.vendor_id ? vendorMap.get(user.vendor_id) ?? '-' : '-'}
                </td>
                <td className="py-2 px-3 flex gap-2">
                  <Button variant="ghost" size="sm" onClick={() => setEditTarget(user)}>
                    編集
                  </Button>
                  <Button variant="danger" size="sm" onClick={() => setDeleteTarget(user.id)}>
                    削除
                  </Button>
                </td>
              </tr>
            ))
          )}
        </tbody>
      </table>

      <AddUserModal
        open={showAddModal}
        onClose={() => setShowAddModal(false)}
        vendors={vendors}
        onAdd={addUser}
      />

      <EditUserModal
        open={!!editTarget}
        onClose={() => setEditTarget(null)}
        user={editTarget}
        vendors={vendors}
        onUpdate={updateUser}
      />

      <ConfirmDialog
        open={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={handleDelete}
        title="ユーザー削除"
        message="このユーザーを削除しますか？"
        confirmLabel="削除"
        variant="danger"
      />
    </div>
  );
}
