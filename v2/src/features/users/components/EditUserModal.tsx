import { useState, useEffect, type FormEvent } from 'react';
import { Modal } from '@/components/ui/Modal';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { Button } from '@/components/ui/Button';
import { useToast } from '@/components/ui/Toast';
import { MIN_PASSWORD_LENGTH, ROLE_OPTIONS } from '../constants';
import type { DbProfile, DbVendor } from '@/types/database';

interface EditUserModalProps {
  open: boolean;
  onClose: () => void;
  user: DbProfile | null;
  vendors: DbVendor[];
  /** 戻り値はパスワードを変えたかどうか */
  onUpdate: (
    id: string,
    params: { role: DbProfile['role']; vendor_id: string | null; password?: string },
  ) => Promise<boolean>;
}

// v1: js/admin-users.js openEditUserModal / handleEditUserSubmit（無効化・有効化は一覧の行ボタンで行う）
export function EditUserModal({ open, onClose, user, vendors, onUpdate }: EditUserModalProps) {
  const { addToast } = useToast();
  const [role, setRole] = useState<DbProfile['role']>('user');
  const [vendorId, setVendorId] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (user) {
      setRole(user.role);
      setVendorId(user.vendor_id ?? '');
      setPassword('');
    }
  }, [user]);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!user) return;
    setSubmitting(true);
    try {
      const passwordChanged = await onUpdate(user.id, {
        role,
        vendor_id: vendorId || null,
        password,
      });
      addToast(
        passwordChanged ? 'ユーザー情報とパスワードを更新しました' : 'ユーザー情報を更新しました',
        'success',
      );
      onClose();
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      // 入力の確認はそのまま、保存の失敗は前置きを付ける（v1 と同じ）
      if (
        message === '保守会社を選択してください' ||
        message.startsWith(`パスワードは${MIN_PASSWORD_LENGTH}文字`)
      ) {
        addToast(message, 'error');
      } else {
        addToast(`更新に失敗しました: ${message}`, 'error');
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal open={open} onClose={onClose} title="ユーザー編集">
      <form className="space-y-4" onSubmit={handleSubmit}>
        <Input
          label="メールアドレス *"
          id="editUserEmail"
          type="email"
          value={user?.email ?? ''}
          disabled
          readOnly
        />
        <Input
          label="パスワード"
          id="editUserPassword"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="変更する場合のみ入力"
          autoComplete="new-password"
        />
        <div className="space-y-1">
          <Select
            label="保守会社 *"
            id="editUserVendor"
            options={vendors.map((v) => ({ value: v.id, label: v.vendor_name }))}
            placeholder="-- 選択なし（管理者の場合） --"
            value={vendorId}
            onChange={(e) => setVendorId(e.target.value)}
          />
          <p className="text-xs text-gray-500">
            一般ユーザーは必須です。管理者は未選択のままで構いません
          </p>
        </div>
        <Select
          label="権限 *"
          id="editUserRole"
          options={ROLE_OPTIONS}
          value={role}
          onChange={(e) => setRole(e.target.value as DbProfile['role'])}
        />
        <div className="flex justify-end gap-3 pt-2">
          <Button type="button" variant="secondary" onClick={onClose}>
            キャンセル
          </Button>
          <Button type="submit" disabled={submitting}>
            {submitting ? '更新中...' : '更新'}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
