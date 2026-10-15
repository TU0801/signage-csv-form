import { useState, useEffect, type FormEvent } from 'react';
import { Modal } from '@/components/ui/Modal';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { Combobox } from '@/components/ui/Combobox';
import { Button } from '@/components/ui/Button';
import { useToast } from '@/components/ui/Toast';
import { MIN_PASSWORD_LENGTH, ROLE_OPTIONS } from '../constants';
import { vendorOptions } from '../vendorOptions';
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

type FieldErrors = Partial<Record<'password' | 'vendor', string>>;

// v1: js/admin-users.js openEditUserModal / handleEditUserSubmit（無効化・有効化は一覧の行ボタンで行う）
export function EditUserModal({ open, onClose, user, vendors, onUpdate }: EditUserModalProps) {
  const { addToast } = useToast();
  const [role, setRole] = useState<DbProfile['role']>('user');
  const [vendorId, setVendorId] = useState('');
  const [password, setPassword] = useState('');
  const [errors, setErrors] = useState<FieldErrors>({});
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (user) {
      setRole(user.role);
      setVendorId(user.vendor_id ?? '');
      setPassword('');
      setErrors({});
    }
  }, [user]);

  // 開いたときの値から変えていたら、Escape・背景クリック・× では破棄の確認を出す
  const dirty =
    !!user && (role !== user.role || vendorId !== (user.vendor_id ?? '') || password !== '');

  /** 入力の確認は欄の下に出す（useUsers.editUser と同じ条件。そちらは最後の砦として残す） */
  const validate = (): FieldErrors => {
    const next: FieldErrors = {};
    if (password && password.length < MIN_PASSWORD_LENGTH) {
      next.password = `パスワードは${MIN_PASSWORD_LENGTH}文字以上で入力してください`;
    }
    if (role !== 'admin' && !vendorId) next.vendor = '一般ユーザーは保守会社を選択してください';
    return next;
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!user) return;
    const found = validate();
    setErrors(found);
    if (Object.keys(found).length > 0) return;
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
    <Modal open={open} onClose={onClose} title="ユーザー編集" dirty={dirty}>
      <form className="space-y-4" onSubmit={handleSubmit} noValidate>
        {/* メールアドレスは変えられないので、入力欄ではなく文字で出す */}
        <div className="space-y-0.5">
          <p className="text-xs font-medium text-gray-600">メールアドレス</p>
          <p id="editUserEmail" className="break-all text-sm text-gray-900">
            {user?.email ?? ''}
          </p>
        </div>
        <Input
          label="パスワード"
          id="editUserPassword"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="変更する場合のみ入力"
          autoComplete="new-password"
          error={errors.password}
        />
        {/* 権限で保守会社が要るかが決まるので、権限を先に選ぶ */}
        <Select
          label="権限 *"
          id="editUserRole"
          options={ROLE_OPTIONS}
          value={role}
          onChange={(e) => {
            setRole(e.target.value as DbProfile['role']);
            setErrors((prev) => ({ ...prev, vendor: undefined }));
          }}
        />
        <div className="space-y-1">
          <Combobox
            label="保守会社"
            required={role !== 'admin'}
            id="editUserVendor"
            options={vendorOptions(vendors, { withNone: role === 'admin' })}
            placeholder="選択してください（社名の一部で検索）"
            value={vendorId}
            onChange={(v) => {
              setVendorId(v);
              setErrors((prev) => ({ ...prev, vendor: undefined }));
            }}
            error={errors.vendor}
          />
          <p className="text-xs text-gray-500">
            一般ユーザーは必須です。管理者は未選択のままで構いません
          </p>
        </div>
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
