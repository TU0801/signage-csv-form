import { useState, useEffect } from 'react';
import { Modal } from '@/components/ui/Modal';
import { Select } from '@/components/ui/Select';
import { Button } from '@/components/ui/Button';
import { useToast } from '@/components/ui/Toast';
import type { DbProfile, DbVendor } from '@/types/database';

interface EditUserModalProps {
  open: boolean;
  onClose: () => void;
  user: DbProfile | null;
  vendors: DbVendor[];
  onUpdate: (id: string, params: { role?: DbProfile['role']; vendor_id?: string | null; is_active?: boolean }) => Promise<void>;
}

export function EditUserModal({ open, onClose, user, vendors, onUpdate }: EditUserModalProps) {
  const { addToast } = useToast();
  const [role, setRole] = useState<DbProfile['role']>('user');
  const [vendorId, setVendorId] = useState('');
  const [isActive, setIsActive] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (user) {
      setRole(user.role);
      setVendorId(user.vendor_id ?? '');
      setIsActive(user.is_active ?? true);
    }
  }, [user]);

  const handleSubmit = async () => {
    if (!user) return;
    setSubmitting(true);
    try {
      await onUpdate(user.id, {
        role,
        vendor_id: vendorId || null,
        is_active: isActive,
      });
      addToast('ユーザーを更新しました', 'success');
      onClose();
    } catch (err) {
      addToast(err instanceof Error ? err.message : '更新に失敗しました', 'error');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal open={open} onClose={onClose} title="ユーザー編集">
      <div className="space-y-4">
        <div className="text-sm text-gray-600">
          <span className="font-medium">メール:</span> {user?.email}
        </div>
        <Select
          label="役割"
          options={[
            { value: 'admin', label: '管理者' },
            { value: 'user', label: '一般ユーザー' },
          ]}
          value={role}
          onChange={(e) => setRole(e.target.value as DbProfile['role'])}
        />
        <Select
          label="保守会社"
          options={vendors.map((v) => ({ value: v.id, label: v.vendor_name }))}
          placeholder="保守会社を選択（任意）"
          value={vendorId}
          onChange={(e) => setVendorId(e.target.value)}
        />
        <div className="flex items-center gap-2">
          <input
            type="checkbox"
            id="isActive"
            checked={isActive}
            onChange={(e) => setIsActive(e.target.checked)}
            className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
          />
          <label htmlFor="isActive" className="text-sm text-gray-700">
            有効
          </label>
        </div>
        <div className="flex justify-end gap-3 pt-2">
          <Button variant="secondary" onClick={onClose}>
            キャンセル
          </Button>
          <Button onClick={handleSubmit} disabled={submitting}>
            保存
          </Button>
        </div>
      </div>
    </Modal>
  );
}
