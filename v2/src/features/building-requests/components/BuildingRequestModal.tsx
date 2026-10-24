import { useEffect, useState } from 'react';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { useToast } from '@/components/ui/Toast';
import { MonthCheckboxes } from '@/features/master/components/property/MonthCheckboxes';
import { useAuthStore } from '@/stores/authStore';
import { fetchMasterInspectionTypes, fetchMasterVendors } from '@/lib/api/masterData';
import {
  createPropertyRequest,
  fetchManagementCompaniesForRequest,
  fetchMyPropertyRequests,
  fetchVendorInspectionTypeOptions,
  PROPERTY_REQUEST_STATUS_LABEL,
  type InspectionTypeOption,
} from '@/lib/api/property-requests';
import type { DbPropertyRequest } from '@/types/database';
import type { ManagementCompanyRow } from '@/types/portal';

export interface BuildingRequestModalProps {
  open: boolean;
  onClose: () => void;
  /** 既定の保守会社（管理者は選択中の会社、保守会社アカウントは自社） */
  vendorId: string | null;
  /** 既定の管理会社（管理会社フィルターの値） */
  managementCompanyId: string | null;
  onSubmitted?: () => void;
}

/** 申請の入力が足りているか。足りなければ欄ごとの日本語の理由 */
export function validatePropertyRequest(form: {
  vendorId: string;
  managementCompanyId: string;
  propertyName: string;
  inspectionTypeId: string;
  inspectionMonths: number[];
}): Partial<Record<'vendor' | 'managementCompany' | 'propertyName' | 'inspectionType', string>> {
  const errors: Partial<
    Record<'vendor' | 'managementCompany' | 'propertyName' | 'inspectionType', string>
  > = {};
  if (!form.vendorId) errors.vendor = '保守会社を選んでください';
  if (!form.managementCompanyId) errors.managementCompany = '管理会社を選んでください';
  if (!form.propertyName.trim()) errors.propertyName = '建物名を入力してください';
  // 点検月だけでは点検行を作れない（DB の CHECK も同じ）
  if (form.inspectionMonths.length > 0 && !form.inspectionTypeId) {
    errors.inspectionType = '点検月を入れるときは点検種別を選んでください';
  }
  return errors;
}

// 管理会社フィルターの「未設定」（single-entry の MANAGEMENT_COMPANY_NONE）などの id でない値は既定にしない
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** 点検登録フォームに無い建物を申請する。管理者が承認すると業務システムに物件ができる */
export function BuildingRequestModal({
  open,
  onClose,
  vendorId,
  managementCompanyId,
  onSubmitted,
}: BuildingRequestModalProps) {
  const profile = useAuthStore((s) => s.profile);
  const isAdmin = profile?.role === 'admin';
  // 保守会社アカウントは自社に固定（props より自分のプロファイルを優先する）
  const defaultVendor = (isAdmin ? vendorId : profile?.vendor_id) ?? '';
  const defaultCompany =
    managementCompanyId && UUID.test(managementCompanyId) ? managementCompanyId : '';
  const { addToast } = useToast();

  const [vendor, setVendor] = useState(defaultVendor);
  const [company, setCompany] = useState(defaultCompany);
  const [propertyName, setPropertyName] = useState('');
  const [address, setAddress] = useState('');
  const [inspectionType, setInspectionType] = useState('');
  const [months, setMonths] = useState<number[]>([]);
  const [errors, setErrors] = useState<ReturnType<typeof validatePropertyRequest>>({});
  const [sending, setSending] = useState(false);
  const [submitted, setSubmitted] = useState<DbPropertyRequest | null>(null);

  const [vendors, setVendors] = useState<{ id: string; name: string }[]>([]);
  const [companies, setCompanies] = useState<ManagementCompanyRow[]>([]);
  const [typeOptions, setTypeOptions] = useState<InspectionTypeOption[]>([]);
  /** 保守会社に点検種別の紐付けが無いとき、全点検種別から選べるようにした */
  const [typesFromAll, setTypesFromAll] = useState(false);
  const [history, setHistory] = useState<DbPropertyRequest[]>([]);
  const [loadError, setLoadError] = useState('');

  // 開き直したら入力を既定に戻す（effect で setState しないよう描画中に合わせる）
  const resetForm = () => {
    setVendor(defaultVendor);
    setCompany(defaultCompany);
    setPropertyName('');
    setAddress('');
    setMonths([]);
    setErrors({});
    setSubmitted(null);
  };
  const [prevOpen, setPrevOpen] = useState(open);
  if (open !== prevOpen) {
    setPrevOpen(open);
    if (open) resetForm();
  }

  // 候補（保守会社・管理会社）と自分の申請の履歴
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    Promise.all([fetchMasterVendors(), fetchManagementCompaniesForRequest()]).then(
      ([v, c]) => {
        if (cancelled) return;
        setVendors(v.map((x) => ({ id: x.id, name: x.vendor_name })));
        setCompanies(c);
        setLoadError('');
      },
      (err) => {
        console.error('Failed to load building request options:', err);
        if (!cancelled) setLoadError('保守会社・管理会社の候補を読み込めませんでした');
      },
    );
    if (profile?.id) {
      fetchMyPropertyRequests(profile.id).then(
        (rows) => {
          if (!cancelled) setHistory(rows);
        },
        (err) => console.error('Failed to load my property requests:', err),
      );
    }
    return () => {
      cancelled = true;
    };
  }, [open, profile?.id, submitted]);

  // 点検種別の候補は保守会社ごと。既定は保守会社に紐付いた点検種別の先頭（点検種別マスターの並び順）
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    if (!vendor) {
      Promise.resolve().then(() => {
        if (cancelled) return;
        setTypeOptions([]);
        setInspectionType('');
      });
      return () => {
        cancelled = true;
      };
    }
    fetchVendorInspectionTypeOptions(vendor)
      .then(async (linked) => {
        if (linked.length > 0) return { options: linked, all: false };
        const all = await fetchMasterInspectionTypes();
        return { options: all.map((t) => ({ id: t.id, name: t.inspection_name })), all: true };
      })
      .then(
        ({ options, all }) => {
          if (cancelled) return;
          setTypeOptions(options);
          setTypesFromAll(all);
          setInspectionType(all ? '' : (options[0]?.id ?? ''));
        },
        (err) => {
          console.error('Failed to load inspection types:', err);
          if (cancelled) return;
          setTypeOptions([]);
          setInspectionType('');
        },
      );
    return () => {
      cancelled = true;
    };
  }, [open, vendor]);

  // 直した欄のエラーは消す（申請するを押すまで他の欄は確かめ直さない）
  const clearError = (key: keyof typeof errors) =>
    setErrors((prev) => {
      if (!prev[key]) return prev;
      const next = { ...prev };
      delete next[key];
      return next;
    });

  const dirty =
    !submitted && (propertyName.trim() !== '' || address.trim() !== '' || months.length > 0);

  const submit = async () => {
    const found = validatePropertyRequest({
      vendorId: vendor,
      managementCompanyId: company,
      propertyName,
      inspectionTypeId: inspectionType,
      inspectionMonths: months,
    });
    setErrors(found);
    if (Object.keys(found).length > 0) return;
    setSending(true);
    try {
      const row = await createPropertyRequest({
        vendorId: vendor,
        managementCompanyId: company,
        propertyName,
        address,
        inspectionTypeId: inspectionType || null,
        inspectionMonths: months,
      });
      setSubmitted(row);
      addToast('建物追加を申請しました', 'success');
      onSubmitted?.();
    } catch (err) {
      console.error('Failed to create property request:', err);
      const message = (err as { message?: string })?.message;
      addToast(
        message && /[ぁ-んァ-ン一-龥]/.test(message)
          ? `申請できませんでした: ${message}`
          : '申請できませんでした',
        'error',
      );
    } finally {
      setSending(false);
    }
  };

  const vendorName = vendors.find((v) => v.id === vendor)?.name ?? '';
  const companyName = (id: string) => companies.find((c) => c.id === id)?.name ?? '-';

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="建物追加 申請"
      dirty={dirty}
      footer={
        submitted ? (
          <>
            <Button variant="secondary" size="sm" onClick={resetForm}>
              続けて申請
            </Button>
            <Button size="sm" onClick={onClose}>
              閉じる
            </Button>
          </>
        ) : (
          <>
            <Button variant="secondary" size="sm" onClick={onClose} disabled={sending}>
              キャンセル
            </Button>
            <Button size="sm" onClick={submit} disabled={sending}>
              {sending ? '申請中...' : '申請する'}
            </Button>
          </>
        )
      }
    >
      {submitted ? (
        <div className="space-y-2" role="status">
          <p className="text-sm font-medium text-green-700">
            「{submitted.property_name}」の追加を申請しました。
          </p>
          <p className="text-sm text-gray-700">承認されると点検登録フォームに行が出ます。</p>
          <p className="text-xs text-gray-500">
            管理者が物件コードを決めて承認します。結果はこの画面の「これまでの申請」で確認できます。
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          <p className="text-xs text-gray-600">
            点検登録フォームの物件に無い建物を申請します。管理者が承認すると物件ができ、点検登録フォームに行が出ます。
          </p>
          {loadError && <p className="text-xs text-red-600">{loadError}</p>}
          <div className="grid grid-cols-2 gap-x-3 gap-y-2">
            {isAdmin ? (
              <Select
                id="buildingRequestVendor"
                label="保守会社 *"
                value={vendor}
                onChange={(e) => {
                  setVendor(e.target.value);
                  clearError('vendor');
                }}
                placeholder="選択してください"
                options={vendors.map((v) => ({ value: v.id, label: v.name }))}
                error={errors.vendor}
              />
            ) : (
              <div className="space-y-0.5">
                <span className="block text-xs font-medium text-gray-600">保守会社 *</span>
                <p
                  className="rounded-md border border-gray-200 bg-gray-50 px-2 py-1.5 text-sm text-gray-700"
                  data-testid="buildingRequestVendorFixed"
                >
                  {vendorName || '-'}
                </p>
                {errors.vendor && <p className="text-xs text-red-600">{errors.vendor}</p>}
              </div>
            )}
            <Select
              id="buildingRequestCompany"
              label="管理会社 *"
              value={company}
              onChange={(e) => {
                setCompany(e.target.value);
                clearError('managementCompany');
              }}
              placeholder="選択してください"
              options={companies.map((c) => ({ value: c.id, label: c.name }))}
              error={errors.managementCompany}
            />
            <Input
              id="buildingRequestName"
              label="建物名 *"
              value={propertyName}
              maxLength={200}
              onChange={(e) => {
                setPropertyName(e.target.value);
                clearError('propertyName');
              }}
              placeholder="例: ○○マンション"
              error={errors.propertyName}
              data-autofocus
            />
            <Input
              id="buildingRequestAddress"
              label="住所（任意）"
              value={address}
              maxLength={300}
              onChange={(e) => setAddress(e.target.value)}
              placeholder="例: 東京都港区…"
            />
            <Select
              id="buildingRequestInspectionType"
              label="点検種別"
              value={inspectionType}
              onChange={(e) => {
                setInspectionType(e.target.value);
                clearError('inspectionType');
              }}
              placeholder="（指定しない）"
              options={typeOptions.map((t) => ({ value: t.id, label: t.name }))}
              error={errors.inspectionType}
            />
            <div className="space-y-0.5">
              <span className="block text-xs font-medium text-gray-600">点検月（任意）</span>
              <MonthCheckboxes
                value={months}
                onChange={(m) => {
                  setMonths(m);
                  clearError('inspectionType');
                }}
                label="点検月"
              />
            </div>
          </div>
          <p className="text-xs text-gray-400">
            点検種別の既定は保守会社に紐付いた点検種別の先頭です。
            {typesFromAll &&
              '（この保守会社には点検種別の紐付けが無いので、全点検種別から選べます）'}
            点検種別を選ぶと、承認時にその点検が登録されます。
          </p>
        </div>
      )}
      {history.length > 0 && (
        <div className="mt-3 border-t border-gray-200 pt-2">
          <h3 className="text-xs font-semibold text-gray-700">これまでの申請</h3>
          <table className="mt-1 w-full text-left text-xs">
            <thead>
              <tr className="text-gray-500">
                <th className="py-0.5 pr-2 font-medium">申請日</th>
                <th className="py-0.5 pr-2 font-medium">建物名</th>
                <th className="py-0.5 pr-2 font-medium">管理会社</th>
                <th className="py-0.5 pr-2 font-medium">状態</th>
                <th className="py-0.5 font-medium">物件コード／却下の理由</th>
              </tr>
            </thead>
            <tbody>
              {history.map((h) => (
                <tr key={h.id} className="border-t border-gray-100">
                  <td className="whitespace-nowrap py-0.5 pr-2 text-gray-500">
                    {new Date(h.created_at).toLocaleDateString('ja-JP')}
                  </td>
                  <td className="py-0.5 pr-2 text-gray-900">{h.property_name}</td>
                  <td className="py-0.5 pr-2 text-gray-700">
                    {companyName(h.management_company_id)}
                  </td>
                  <td className="whitespace-nowrap py-0.5 pr-2">
                    {PROPERTY_REQUEST_STATUS_LABEL[h.status]}
                  </td>
                  <td className="py-0.5 text-gray-700">
                    {h.status === 'approved'
                      ? h.created_property_code
                      : h.status === 'rejected'
                        ? h.reject_reason
                        : '-'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Modal>
  );
}
