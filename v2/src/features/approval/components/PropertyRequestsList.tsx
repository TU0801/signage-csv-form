import { useCallback, useEffect, useState } from 'react';
import { Button } from '@/components/ui/Button';
import { Card, CardContent, CardHeader } from '@/components/ui/Card';
import { Input } from '@/components/ui/Input';
import { Modal } from '@/components/ui/Modal';
import { Spinner } from '@/components/ui/Spinner';
import { TextArea } from '@/components/ui/TextArea';
import { useToast } from '@/components/ui/Toast';
import { useAdminCountsStore } from '@/stores/adminCountsStore';
import { fetchMasterInspectionTypes, fetchMasterVendors } from '@/lib/api/masterData';
import { fetchProfileEmails } from '@/features/relationships/api';
import {
  approvePropertyRequest,
  fetchManagementCompaniesForRequest,
  fetchPendingPropertyRequests,
  rejectPropertyRequest,
} from '@/lib/api/property-requests';
import type { DbPropertyRequest } from '@/types/database';
import { useRefetchOnVisible } from '../hooks/useRefetchOnVisible';

export interface PropertyRequestRow extends DbPropertyRequest {
  vendorName: string;
  managementCompanyName: string;
  inspectionTypeName: string;
  requesterEmail: string;
}

/** 物件コードの形（DB の approve_property_request と同じ。本番の物件コードはすべてこの形） */
export const PROPERTY_CODE_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_-]{0,31}$/;

/** RPC のエラーから利用者に見せる文言（DB が日本語で返したものはそのまま） */
function rpcMessage(err: unknown, fallback: string): string {
  const message = (err as { message?: string })?.message;
  return message && /[ぁ-んァ-ン一-龥]/.test(message) ? message : fallback;
}

/** 承認待ちの「ビル追加」タブの下段: 新規建物の申請（管理者だけ）。承認時に物件コードを入れる・却下は理由を入れる */
export function PropertyRequestsList() {
  const { addToast } = useToast();
  const [rows, setRows] = useState<PropertyRequestRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [approveTarget, setApproveTarget] = useState<PropertyRequestRow | null>(null);
  const [rejectTarget, setRejectTarget] = useState<PropertyRequestRow | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const requests = await fetchPendingPropertyRequests();
      useAdminCountsStore.getState().setPropertyRequests(requests.length);
      const requesterIds = [
        ...new Set(requests.map((r) => r.requested_by).filter((id): id is string => !!id)),
      ];
      const [vendors, companies, types, emails] = await Promise.all([
        fetchMasterVendors(),
        fetchManagementCompaniesForRequest(),
        fetchMasterInspectionTypes(),
        fetchProfileEmails(requesterIds),
      ]);
      const vendorMap = new Map(vendors.map((v) => [v.id, v.vendor_name]));
      const companyMap = new Map(companies.map((c) => [c.id, c.name]));
      const typeMap = new Map(types.map((t) => [t.id, t.inspection_name]));
      setRows(
        requests.map((r) => ({
          ...r,
          vendorName: vendorMap.get(r.vendor_id) ?? '-',
          managementCompanyName: companyMap.get(r.management_company_id) ?? '-',
          inspectionTypeName: (r.inspection_type_id && typeMap.get(r.inspection_type_id)) || '-',
          requesterEmail: (r.requested_by && emails.get(r.requested_by)) || '-',
        })),
      );
    } catch (err) {
      console.error('Failed to load property requests:', err);
      setError('新規建物の申請の取得に失敗しました');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);
  useRefetchOnVisible(load, !loading && !approveTarget && !rejectTarget);

  const approve = async (code: string) => {
    if (!approveTarget) return;
    await approvePropertyRequest(approveTarget.id, code);
    addToast(`「${approveTarget.property_name}」を物件コード ${code} で登録しました`, 'success');
    setApproveTarget(null);
    await load();
  };

  const reject = async (reason: string) => {
    if (!rejectTarget) return;
    await rejectPropertyRequest(rejectTarget.id, reason);
    addToast(`「${rejectTarget.property_name}」の申請を却下しました`, 'success');
    setRejectTarget(null);
    await load();
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-sm font-semibold text-gray-900">新規建物の申請 ({rows.length}件)</h2>
          <Button size="sm" variant="ghost" onClick={() => void load()}>
            更新
          </Button>
        </div>
        <p className="mt-0.5 text-xs text-gray-500">
          点検登録フォームに無い建物の追加申請です。承認すると業務システムに物件・担当保守会社・点検（点検種別と点検月）ができます。
        </p>
      </CardHeader>
      <CardContent className="p-0">
        {loading && rows.length === 0 ? (
          <div className="flex justify-center py-6">
            <Spinner />
          </div>
        ) : error ? (
          <div className="px-3 py-3">
            <p className="text-sm text-red-600">{error}</p>
            <Button variant="secondary" size="sm" onClick={() => void load()} className="mt-2">
              再読み込み
            </Button>
          </div>
        ) : rows.length === 0 ? (
          <p className="px-3 py-6 text-center text-sm text-gray-500">
            承認待ちの新規建物の申請はありません
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead>
                <tr className="border-b border-gray-200 bg-gray-50">
                  <th className="cell-head font-medium text-gray-500">建物名</th>
                  <th className="cell-head font-medium text-gray-500">住所</th>
                  <th className="cell-head font-medium text-gray-500">管理会社</th>
                  <th className="cell-head font-medium text-gray-500">保守会社</th>
                  <th className="cell-head font-medium text-gray-500">点検種別</th>
                  <th className="cell-head font-medium text-gray-500">点検月</th>
                  <th className="cell-head font-medium text-gray-500">申請者</th>
                  <th className="cell-head font-medium text-gray-500">申請日時</th>
                  <th className="cell-head sticky right-0 bg-gray-50 font-medium text-gray-500 shadow-[inset_1px_0_0_var(--color-gray-200)]">
                    操作
                  </th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id} className="group border-b border-gray-100 hover:bg-gray-50">
                    <td className="cell text-sm text-gray-900">{r.property_name}</td>
                    <td className="cell text-sm text-gray-600">{r.address || '-'}</td>
                    <td className="cell text-sm text-gray-900">{r.managementCompanyName}</td>
                    <td className="cell text-sm text-gray-900">{r.vendorName}</td>
                    <td className="cell text-sm text-gray-700">{r.inspectionTypeName}</td>
                    <td className="cell whitespace-nowrap text-sm text-gray-700">
                      {r.inspection_months.length > 0 ? r.inspection_months.join(',') : '-'}
                    </td>
                    <td className="cell whitespace-nowrap text-sm text-gray-500">
                      {r.requesterEmail}
                    </td>
                    <td className="cell whitespace-nowrap text-sm text-gray-500">
                      {new Date(r.created_at).toLocaleString('ja-JP')}
                    </td>
                    <td className="cell sticky right-0 bg-white shadow-[inset_1px_0_0_var(--color-gray-200)] group-hover:bg-gray-50">
                      <div className="-my-0.5 flex items-center gap-1">
                        <Button size="sm" variant="success" onClick={() => setApproveTarget(r)}>
                          承認
                        </Button>
                        <Button size="sm" variant="danger" onClick={() => setRejectTarget(r)}>
                          却下
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
      <ApproveDialog
        target={approveTarget}
        onClose={() => setApproveTarget(null)}
        onConfirm={approve}
      />
      <RejectDialog
        target={rejectTarget}
        onClose={() => setRejectTarget(null)}
        onConfirm={reject}
      />
    </Card>
  );
}

interface DialogProps {
  target: PropertyRequestRow | null;
  onClose: () => void;
  /** 失敗したら throw（ダイアログは開いたまま、理由を出す） */
  onConfirm: (value: string) => Promise<void>;
}

function useDialogValue(target: PropertyRequestRow | null) {
  const [value, setValue] = useState('');
  const [error, setError] = useState('');
  const [sending, setSending] = useState(false);
  const [prevTarget, setPrevTarget] = useState(target);
  if (target !== prevTarget) {
    setPrevTarget(target);
    setValue('');
    setError('');
  }
  return { value, setValue, error, setError, sending, setSending };
}

function subject(t: PropertyRequestRow): string {
  return `${t.property_name}（管理会社: ${t.managementCompanyName} / 保守会社: ${t.vendorName}）`;
}

/** 承認: 物件コードを入れる（形式と重複は DB 側でも確かめる） */
export function ApproveDialog({ target, onClose, onConfirm }: DialogProps) {
  const { value, setValue, error, setError, sending, setSending } = useDialogValue(target);
  const submit = async () => {
    const code = value.trim();
    if (!PROPERTY_CODE_PATTERN.test(code)) {
      setError(
        '物件コードは英数字・ハイフン・アンダーバーの32文字以内で入力してください（例: 120074-00）',
      );
      return;
    }
    setSending(true);
    try {
      await onConfirm(code);
    } catch (err) {
      setError(rpcMessage(err, '承認に失敗しました'));
    } finally {
      setSending(false);
    }
  };
  return (
    <Modal
      open={!!target}
      onClose={onClose}
      title="新規建物の申請の承認"
      dirty={value.trim() !== ''}
      footer={
        <>
          <Button variant="secondary" size="sm" onClick={onClose} disabled={sending}>
            キャンセル
          </Button>
          <Button variant="success" size="sm" onClick={submit} disabled={sending}>
            {sending ? '登録中...' : '物件を登録して承認'}
          </Button>
        </>
      }
    >
      {target && (
        <div className="space-y-2">
          <p className="text-xs text-gray-600">{subject(target)}</p>
          <Input
            id="propertyRequestCode"
            label="物件コード *"
            value={value}
            maxLength={32}
            placeholder="例: 120074-00"
            error={error || undefined}
            onChange={(e) => {
              setValue(e.target.value);
              if (error) setError('');
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.nativeEvent.isComposing) void submit();
            }}
          />
          <p className="text-xs text-gray-400">
            業務システムに物件（点検物件・請求対象外）を作り、保守会社の担当にします。
            {target.inspection_type_id
              ? `点検「${target.inspectionTypeName}」（点検月 ${target.inspection_months.join(',') || '未登録'}）も登録します。`
              : '点検種別の指定が無いので、点検は登録しません（マスター管理で追加できます）。'}
            物件コードは後から変えられません。
          </p>
        </div>
      )}
    </Modal>
  );
}

/** 却下: 理由は必須（申請者の申請モーダルの「これまでの申請」に出る） */
export function RejectDialog({ target, onClose, onConfirm }: DialogProps) {
  const { value, setValue, error, setError, sending, setSending } = useDialogValue(target);
  const submit = async () => {
    if (!value.trim()) {
      setError('却下の理由を入力してください');
      return;
    }
    setSending(true);
    try {
      await onConfirm(value.trim());
    } catch (err) {
      setError(rpcMessage(err, '却下に失敗しました'));
    } finally {
      setSending(false);
    }
  };
  return (
    <Modal
      open={!!target}
      onClose={onClose}
      title="新規建物の申請の却下"
      dirty={value.trim() !== ''}
      footer={
        <>
          <Button variant="secondary" size="sm" onClick={onClose} disabled={sending}>
            キャンセル
          </Button>
          <Button variant="danger" size="sm" onClick={submit} disabled={sending}>
            却下する
          </Button>
        </>
      }
    >
      {target && (
        <div className="space-y-2">
          <p className="text-xs text-gray-600">{subject(target)}</p>
          <TextArea
            id="propertyRequestRejectReason"
            label="却下の理由 *"
            rows={3}
            value={value}
            error={error || undefined}
            onChange={(e) => {
              setValue(e.target.value);
              if (error) setError('');
            }}
          />
          <p className="text-xs text-gray-400">
            理由は申請者の「建物追加 申請」画面に表示されます。
          </p>
        </div>
      )}
    </Modal>
  );
}
