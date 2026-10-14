import { useState } from 'react';
import { Modal } from '@/components/ui/Modal';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { Button } from '@/components/ui/Button';
import { useToast } from '@/components/ui/Toast';
import type { DbProfile, DbVendor } from '@/types/database';

interface AddUserModalProps {
  open: boolean;
  onClose: () => void;
  vendors: DbVendor[];
  onAdd: (params: {
    email: string;
    password: string;
    role: DbProfile['role'];
    vendor_id: string | null;
  }) => Promise<void>;
}

export function AddUserModal({ open, onClose, vendors, onAdd }: AddUserModalProps) {
  const { addToast } = useToast();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState<DbProfile['role']>('user');
  const [vendorId, setVendorId] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const resetForm = () => {
    setEmail('');
    setPassword('');
    setRole('user');
    setVendorId('');
  };

  const handleSubmit = async () => {
    if (!email.trim() || !password) {
      addToast('メールアドレスとパスワードは必須です', 'error');
      return;
    }
    setSubmitting(true);
    try {
      await onAdd({
        email: email.trim(),
        password,
        role,
        vendor_id: vendorId || null,
      });
      addToast('ユーザーを追加しました', 'success');
      resetForm();
      onClose();
    } catch (err) {
      addToast(err instanceof Error ? err.message : '追加に失敗しました', 'error');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal open={open} onClose={onClose} title="ユーザー追加">
      <div className="space-y-4">
        <Input
          label="メールアドレス"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="example@example.com"
        />
        <Input
          label="初期パスワード"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          autoComplete="new-password"
        />
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
        <div className="flex justify-end gap-3 pt-2">
          <Button variant="secondary" onClick={onClose}>
            キャンセル
          </Button>
          <Button onClick={handleSubmit} disabled={submitting}>
            追加
          </Button>
        </div>
      </div>
    </Modal>
  );
}
