import { useEffect, useCallback, useState } from 'react';
import { Button } from '@/components/ui/Button';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { Spinner } from '@/components/ui/Spinner';
import { Card, CardHeader, CardContent } from '@/components/ui/Card';
import { useToast } from '@/components/ui/Toast';
import { useBuildingRequests } from '../hooks/useBuildingRequests';
import { useRefetchOnVisible } from '../hooks/useRefetchOnVisible';

// v1: js/admin-relationships.js renderPendingBuildingRequests（admin.html #approval-buildings）
export function BuildingRequestsList() {
  const { requests, loading, error, fetchPendingRequests, approveRequest, rejectRequest } =
    useBuildingRequests();
  const { addToast } = useToast();
  const [rejectTarget, setRejectTarget] = useState<string | null>(null);

  useEffect(() => {
    fetchPendingRequests();
  }, [fetchPendingRequests]);

  // 別のタブから戻ったら読み直す（却下の確認を開いている間は読み直さない）
  useRefetchOnVisible(fetchPendingRequests, !loading && rejectTarget === null);

  const handleApprove = useCallback(
    async (id: string) => {
      try {
        await approveRequest(id);
        addToast('ビル追加リクエストを承認しました', 'success');
      } catch {
        addToast('承認に失敗しました', 'error');
      }
    },
    [approveRequest, addToast],
  );

  // 却下は確認してから（v1 は confirm()。承認には確認が無い）
  const handleReject = useCallback(async () => {
    if (!rejectTarget) return;
    const id = rejectTarget;
    setRejectTarget(null);
    try {
      await rejectRequest(id);
      addToast('ビル追加リクエストを却下しました', 'success');
    } catch {
      addToast('却下に失敗しました', 'error');
    }
  }, [rejectTarget, rejectRequest, addToast]);

  if (loading) {
    return (
      <div className="flex justify-center py-12">
        <Spinner size="lg" />
      </div>
    );
  }

  if (error) {
    return (
      <Card>
        <CardContent>
          <p className="text-red-600">{error}</p>
          <Button variant="secondary" size="sm" onClick={fetchPendingRequests} className="mt-2">
            再読み込み
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-sm font-semibold text-gray-900">
            ビル追加リクエスト ({requests.length}件)
          </h2>
          {/* 開いている間に届いたリクエストは自動では出ないので、いつでも読み直せるようにする */}
          <Button size="sm" variant="ghost" onClick={fetchPendingRequests}>
            更新
          </Button>
        </div>
      </CardHeader>
      <CardContent className="p-0">
        {requests.length === 0 ? (
          <p className="px-3 py-6 text-center text-sm text-gray-500">
            承認待ちのビル追加リクエストはありません
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead>
                <tr className="border-b border-gray-200 bg-gray-50">
                  <th className="cell-head font-medium uppercase text-gray-500">物件コード</th>
                  <th className="cell-head font-medium uppercase text-gray-500">物件名</th>
                  <th className="cell-head font-medium uppercase text-gray-500">保守会社</th>
                  <th className="cell-head font-medium uppercase text-gray-500">申請者</th>
                  <th className="cell-head font-medium uppercase text-gray-500">申請日時</th>
                  <th className="cell-head sticky right-0 bg-gray-50 font-medium text-gray-500 shadow-[inset_1px_0_0_var(--color-gray-200)]">
                    操作
                  </th>
                </tr>
              </thead>
              <tbody>
                {requests.map((req) => (
                  <tr key={req.id} className="group border-b border-gray-100 hover:bg-gray-50">
                    <td className="cell whitespace-nowrap text-sm text-gray-500">{req.property_code}</td>
                    <td className="cell text-sm text-gray-900">
                      <div className="max-w-[16rem] truncate" title={req.propertyName || undefined}>
                        {req.propertyName}
                      </div>
                    </td>
                    <td className="cell text-sm text-gray-900">
                      <div className="max-w-[16rem] truncate" title={req.vendorName || undefined}>
                        {req.vendorName}
                      </div>
                    </td>
                    <td className="cell whitespace-nowrap text-sm text-gray-500">{req.requesterEmail}</td>
                    <td className="cell whitespace-nowrap text-sm text-gray-500">
                      {req.created_at ? new Date(req.created_at).toLocaleString('ja-JP') : '-'}
                    </td>
                    <td className="cell sticky right-0 bg-white shadow-[inset_1px_0_0_var(--color-gray-200)] group-hover:bg-gray-50">
                      <div className="-my-0.5 flex items-center gap-1">
                        <Button
                          size="sm"
                          variant="success"
                          onClick={() => handleApprove(req.id)}
                        >
                          承認
                        </Button>
                        <Button size="sm" variant="danger" onClick={() => setRejectTarget(req.id)}>
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
      <ConfirmDialog
        open={!!rejectTarget}
        onClose={() => setRejectTarget(null)}
        onConfirm={handleReject}
        title="ビル追加リクエストの却下"
        message="このリクエストを却下してもよろしいですか？"
        confirmLabel="却下"
        variant="danger"
      />
    </Card>
  );
}
