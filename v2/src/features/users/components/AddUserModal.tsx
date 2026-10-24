import { useState, type FormEvent } from 'react';
import { Modal } from '@/components/ui/Modal';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { Button } from '@/components/ui/Button';
import { useToast } from '@/components/ui/Toast';
import { MANAGEMENT_ROLE_OPTIONS, MIN_PASSWORD_LENGTH, ROLE_OPTIONS, companyRequiredError } from '../constants';
import { CompanyField } from './CompanyField';
import type { DbProfile, DbVendor } from '@/types/database';
import type { ManagementCompanyRow } from '@/types/portal';

interface AddUserModalProps {
  open: boolean;
  onClose: () => void;
  vendors: DbVendor[];
  managementCompanies: ManagementCompanyRow[];
  onAdd: (params: {
    email: string;
    password: string;
    role: DbProfile['role'];
    vendor_id: string | null;
    management_company_id: string | null;
  }) => Promise<void>;
  /** 管理会社のアカウントが操作する（作れるのは自社の管理会社ユーザーだけ。修正依頼1024 C3） */
  managementCaller?: boolean;
}

type FieldErrors = Partial<Record<'email' | 'password' | 'company', string>>;

// v1: js/admin-users.js openUserModal / handleUserFormSubmit（admin.html #userModal）
export function AddUserModal({
  open,
  onClose,
  vendors,
  managementCompanies,
  onAdd,
  managementCaller = false,
}: AddUserModalProps) {
  const { addToast } = useToast();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  // 既定の権限: 管理者は保守会社（v1 どおり）、管理会社は管理会社（それしか作れない）
  const initialRole: DbProfile['role'] = managementCaller ? 'management' : 'user';
  const [role, setRole] = useState<DbProfile['role']>(initialRole);
  const [vendorId, setVendorId] = useState('');
  const [managementCompanyIdInput, setManagementCompanyId] = useState('');
  // 管理会社のアカウントは自社に固定（選ばせない）
  const managementCompanyId = managementCaller ? (managementCompanies[0]?.id ?? '') : managementCompanyIdInput;
  const [errors, setErrors] = useState<FieldErrors>({});
  const [submitting, setSubmitting] = useState(false);

  // 何か入れていたら、Escape・背景クリック・× では破棄の確認を出す
  const dirty = !!(email || password || vendorId || managementCompanyIdInput || role !== initialRole);

  const resetForm = () => {
    setEmail('');
    setPassword('');
    setRole(initialRole);
    setVendorId('');
    setManagementCompanyId('');
    setErrors({});
  };

  const handleClose = () => {
    resetForm();
    onClose();
  };

  /** 入力の確認は欄の下に出す（useUsers.addUser と同じ条件。そちらは最後の砦として残す） */
  const validate = (): FieldErrors => {
    const next: FieldErrors = {};
    if (!email.trim()) next.email = 'メールアドレスを入力してください';
    // noValidate でブラウザの形式チェックが無くなるため、ここで見る（Edge Function は英語のエラーを返す）
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) next.email = 'メールアドレスの形式が正しくありません';
    if (!password) next.password = 'パスワードを入力してください';
    else if (password.length < MIN_PASSWORD_LENGTH) {
      next.password = `パスワードは${MIN_PASSWORD_LENGTH}文字以上で入力してください`;
    }
    const companyError = companyRequiredError(role, vendorId || null, managementCompanyId || null);
    if (companyError) next.company = companyError;
    return next;
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    const found = validate();
    setErrors(found);
    if (Object.keys(found).length > 0) return;
    setSubmitting(true);
    try {
      await onAdd({
        email: email.trim(),
        password,
        role,
        vendor_id: vendorId || null,
        management_company_id: managementCompanyId || null,
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
        message === '管理会社を選択してください' ||
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
    <Modal open={open} onClose={handleClose} title="ユーザー追加" dirty={dirty}>
      {/* noValidate: ブラウザの吹き出しではなく欄の下に日本語で出す */}
      <form className="space-y-4" onSubmit={handleSubmit} noValidate>
        <Input
          label="メールアドレス *"
          id="newUserEmail"
          type="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="example@company.com"
          autoComplete="username"
          error={errors.email}
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
          error={errors.password}
        />
        {/* 権限で保守会社・管理会社のどちらが要るかが決まるので、権限を先に選ぶ */}
        <Select
          label="権限 *"
          id="newUserRole"
          options={managementCaller ? MANAGEMENT_ROLE_OPTIONS : ROLE_OPTIONS}
          value={role}
          onChange={(e) => {
            setRole(e.target.value as DbProfile['role']);
            setErrors((prev) => ({ ...prev, company: undefined }));
          }}
        />
        <CompanyField
          idPrefix="newUser"
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
          managementCaller={managementCaller}
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
