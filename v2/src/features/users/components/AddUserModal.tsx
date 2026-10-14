import { useState, type FormEvent } from 'react';
import { Modal } from '@/components/ui/Modal';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { Button } from '@/components/ui/Button';
import { useToast } from '@/components/ui/Toast';
import { MIN_PASSWORD_LENGTH, ROLE_OPTIONS } from '../constants';
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

// v1: js/admin-users.js openUserModal / handleUserFormSubmit（admin.html #userModal）
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

  const handleClose = () => {
    resetForm();
    onClose();
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
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
      handleClose();
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      // 入力の確認と Edge Function の日本語の断り文言はそのまま、それ以外は前置きを付ける（v1 と同じ）
      // パスワード長は画面側の確認文言だけを素通しする（Edge Function 由来の文言は v1 どおり前置きを付ける）
      if (
        message.includes('既に登録') ||
        message.includes('プロファイル') ||
        message === '保守会社を選択してください' ||
        message === `パスワードは${MIN_PASSWORD_LENGTH}文字以上で入力してください`
      ) {
        addToast(message, 'error');
      } else {
        addToast(`追加に失敗しました: ${message}`, 'error');
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal open={open} onClose={handleClose} title="ユーザー追加">
      <form className="space-y-4" onSubmit={handleSubmit}>
        <Input
          label="メールアドレス *"
          id="newUserEmail"
          type="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="example@company.com"
          autoComplete="username"
        />
        <Input
          label="パスワード *"
          id="newUserPassword"
          type="password"
          required
          minLength={MIN_PASSWORD_LENGTH}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder={`${MIN_PASSWORD_LENGTH}文字以上`}
          autoComplete="new-password"
        />
        <div className="space-y-1">
          <Select
            label="保守会社 *"
            id="newUserVendor"
            options={vendors.map((v) => ({ value: v.id, label: v.vendor_name }))}
            placeholder="-- 選択してください --"
            value={vendorId}
            onChange={(e) => setVendorId(e.target.value)}
          />
          <p className="text-xs text-gray-500">
            一般ユーザーは必須です。管理者は未選択のままで構いません
          </p>
        </div>
        <Select
          label="権限 *"
          id="newUserRole"
          options={ROLE_OPTIONS}
          value={role}
          onChange={(e) => setRole(e.target.value as DbProfile['role'])}
        />
        <div className="flex justify-end gap-3 pt-2">
          <Button type="button" variant="secondary" onClick={handleClose}>
            キャンセル
          </Button>
          <Button type="submit" disabled={submitting}>
            {submitting ? '追加中...' : '追加'}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
