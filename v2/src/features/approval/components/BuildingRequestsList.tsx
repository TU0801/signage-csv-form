import { useEffect, useCallback } from 'react';
import { Button } from '@/components/ui/Button';
import { Spinner } from '@/components/ui/Spinner';
import { Card, CardHeader, CardContent } from '@/components/ui/Card';
import { useToast } from '@/components/ui/Toast';
import { useAuth } from '@/hooks/useAuth';
import { useBuildingRequests } from '../hooks/useBuildingRequests';

export function BuildingRequestsList() {
  const { requests, loading, error, fetchPendingRequests, approveRequest, rejectRequest } =
    useBuildingRequests();
  const { addToast } = useToast();
  const { user } = useAuth();

  useEffect(() => {
    fetchPendingRequests();
  }, [fetchPendingRequests]);

  const handleApprove = useCallback(
    async (id: string) => {
      try {
        await approveRequest(id, user?.id ?? '');
        addToast('ビル追加リクエストを承認しました', 'success');
      } catch {
        addToast('承認に失敗しました', 'error');
      }
    },
    [approveRequest, addToast, user],
  );

  const handleReject = useCallback(
    async (id: string) => {
      try {
        await rejectRequest(id);
        addToast('ビル追加リクエストを却下しました', 'success');
      } catch {
        addToast('却下に失敗しました', 'error');
      }
    },
    [rejectRequest, addToast],
  );

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
        <h2 className="text-lg font-semibold text-gray-900">
          ビル追加リクエスト ({requests.length}件)
        </h2>
      </CardHeader>
      <CardContent className="p-0">
        {requests.length === 0 ? (
          <p className="px-6 py-8 text-center text-sm text-gray-500">
            承認待ちのビル追加リクエストはありません
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead>
                <tr className="border-b border-gray-200 bg-gray-50">
                  <th className="px-4 py-3 text-xs font-medium uppercase text-gray-500">
                    物件名
                  </th>
                  <th className="px-4 py-3 text-xs font-medium uppercase text-gray-500">
                    物件コード
                  </th>
                  <th className="px-4 py-3 text-xs font-medium uppercase text-gray-500">
                    保守会社
                  </th>
                  <th className="px-4 py-3 text-xs font-medium uppercase text-gray-500">
                    申請日
                  </th>
                  <th className="px-4 py-3 text-xs font-medium uppercase text-gray-500">操作</th>
                </tr>
              </thead>
              <tbody>
                {requests.map((req) => (
                  <tr key={req.id} className="border-b border-gray-100 hover:bg-gray-50">
                    <td className="px-4 py-3 text-sm text-gray-900">{req.propertyName}</td>
                    <td className="px-4 py-3 text-sm text-gray-500">{req.property_code}</td>
                    <td className="px-4 py-3 text-sm text-gray-900">{req.vendorName}</td>
                    <td className="px-4 py-3 text-sm text-gray-500">
                      {req.created_at ? new Date(req.created_at).toLocaleDateString('ja-JP') : '-'}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <Button
                          size="sm"
                          variant="success"
                          onClick={() => handleApprove(req.id)}
                        >
                          承認
                        </Button>
                        <Button size="sm" variant="danger" onClick={() => handleReject(req.id)}>
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
    </Card>
  );
}
