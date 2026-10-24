import { useState, useEffect, type FormEvent } from 'react';
import { Modal } from '@/components/ui/Modal';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { Button } from '@/components/ui/Button';
import { useToast } from '@/components/ui/Toast';
import { MIN_PASSWORD_LENGTH, ROLE_OPTIONS, companyRequiredError, roleLabel } from '../constants';
import { CompanyField } from './CompanyField';
import type { DbProfile, DbVendor } from '@/types/database';
import type { ManagementCompanyRow } from '@/types/portal';

interface EditUserModalProps {
  open: boolean;
  onClose: () => void;
  user: DbProfile | null;
  vendors: DbVendor[];
  managementCompanies: ManagementCompanyRow[];
  /** 戻り値はパスワードを変えたかどうか */
  onUpdate: (
    id: string,
    params: {
      role: DbProfile['role'];
      vendor_id: string | null;
      management_company_id: string | null;
      password?: string;
    },
  ) => Promise<boolean>;
  /** 管理会社のアカウントが操作する: パスワードだけを変える（権限・会社は文字で出す。修正依頼1024 C3） */
  passwordOnly?: boolean;
}

type FieldErrors = Partial<Record<'password' | 'company', string>>;

// v1: js/admin-users.js openEditUserModal / handleEditUserSubmit（無効化・有効化は一覧の行ボタンで行う）
export function EditUserModal({
  open,
  onClose,
  user,
  vendors,
  managementCompanies,
  onUpdate,
  passwordOnly = false,
}: EditUserModalProps) {
  const { addToast } = useToast();
  const [role, setRole] = useState<DbProfile['role']>('user');
  const [vendorId, setVendorId] = useState('');
  const [managementCompanyId, setManagementCompanyId] = useState('');
  const [password, setPassword] = useState('');
  const [errors, setErrors] = useState<FieldErrors>({});
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (user) {
      setRole(user.role);
      setVendorId(user.vendor_id ?? '');
      setManagementCompanyId(user.management_company_id ?? '');
      setPassword('');
      setErrors({});
    }
  }, [user]);

  // 開いたときの値から変えていたら、Escape・背景クリック・× では破棄の確認を出す
  const dirty =
    !!user &&
    (role !== user.role ||
      vendorId !== (user.vendor_id ?? '') ||
      managementCompanyId !== (user.management_company_id ?? '') ||
      password !== '');

  // 管理会社へ付け替えると申請の画面に入れなくなるので、保存前に知らせる（既存の実ユーザーを画面で移す運用）
  const switchingToManagement = !!user && user.role !== 'management' && role === 'management';

  /** 入力の確認は欄の下に出す（useUsers.editUser と同じ条件。そちらは最後の砦として残す） */
  const validate = (): FieldErrors => {
    const next: FieldErrors = {};
    if (password && password.length < MIN_PASSWORD_LENGTH) {
      next.password = `パスワードは${MIN_PASSWORD_LENGTH}文字以上で入力してください`;
    }
    const companyError = companyRequiredError(role, vendorId || null, managementCompanyId || null);
    if (companyError) next.company = companyError;
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
        management_company_id: managementCompanyId || null,
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
        message === '管理会社を選択してください' ||
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
        {passwordOnly ? (
          <div className="space-y-0.5">
            <p className="text-xs font-medium text-gray-600">権限・会社</p>
            <p className="text-sm text-gray-900">
              {roleLabel(role)}
              {role === 'management' && managementCompanies[0] ? `（${managementCompanies[0].name}）` : ''}
            </p>
            <p className="text-xs text-gray-500">権限・会社の変更は管理者が行います</p>
          </div>
        ) : (
          <>
            {/* 権限で保守会社・管理会社のどちらが要るかが決まるので、権限を先に選ぶ */}
            <Select
              label="権限 *"
              id="editUserRole"
              options={ROLE_OPTIONS}
              value={role}
              onChange={(e) => {
                setRole(e.target.value as DbProfile['role']);
                setErrors((prev) => ({ ...prev, company: undefined }));
              }}
            />
            <CompanyField
              idPrefix="editUser"
              role={role}
              vendors={vendors}
              managementCompanies={managementCompanies}
              vendorId={vendorId}
              managementCompanyId={managementCompanyId}
              onVendorChange={(v) => {
                setVendorId(v);
                setErrors((prev) => ({ ...prev, company: undefined }));
              }}
              onManagementCompanyChange={(v) => {
                setManagementCompanyId(v);
                setErrors((prev) => ({ ...prev, company: undefined }));
              }}
              error={errors.company}
            />
          </>
        )}
        {switchingToManagement && (
          <p role="note" className="rounded border border-yellow-200 bg-yellow-50 px-2 py-1.5 text-xs text-yellow-800">
            管理会社へ付け替えると、保守会社の設定は外れ、申請の作成（1件入力・一括入力）ができなくなります。
            ログイン後は自社物件の点検一覧（承認・報告書の確認）だけになります。
          </p>
        )}
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
