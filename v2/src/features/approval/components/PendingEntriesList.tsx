import { useEffect, useState, useCallback } from 'react';
import { Card, CardHeader, CardContent } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Spinner } from '@/components/ui/Spinner';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { useToast } from '@/components/ui/Toast';
import { PendingEntryRow } from './PendingEntryRow';
import { EntryDetailModal } from './EntryDetailModal';
import { usePendingEntries } from '../hooks/usePendingEntries';
import type { DbEntry } from '@/types/database';

export function PendingEntriesList() {
  const { entries, loading, error, fetchPending, approve, reject } = usePendingEntries();
  const { addToast } = useToast();
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [detailEntry, setDetailEntry] = useState<DbEntry | null>(null);
  const [confirmAction, setConfirmAction] = useState<{
    type: 'approve' | 'reject';
    ids: string[];
  } | null>(null);

  useEffect(() => {
    fetchPending();
  }, [fetchPending]);

  const handleSelect = useCallback((id: string, checked: boolean) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (checked) next.add(id);
      else next.delete(id);
      return next;
    });
  }, []);

  const handleSelectAll = useCallback(
    (checked: boolean) => {
      if (checked) {
        setSelectedIds(new Set(entries.map((e) => e.id)));
      } else {
        setSelectedIds(new Set());
      }
    },
    [entries],
  );

  const handleConfirm = useCallback(async () => {
    if (!confirmAction) return;
    try {
      if (confirmAction.type === 'approve') {
        await approve(confirmAction.ids);
        addToast(`${confirmAction.ids.length}件を承認しました`, 'success');
      } else {
        await reject(confirmAction.ids);
        addToast(`${confirmAction.ids.length}件を却下しました`, 'success');
      }
      setSelectedIds(new Set());
    } catch {
      addToast('操作に失敗しました', 'error');
    } finally {
      setConfirmAction(null);
    }
  }, [confirmAction, approve, reject, addToast]);

  const allSelected = entries.length > 0 && selectedIds.size === entries.length;

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-gray-900">
            承認待ちエントリー ({entries.length})
          </h2>
          {selectedIds.size > 0 && (
            <div className="flex gap-2">
              <Button
                size="sm"
                variant="success"
                onClick={() =>
                  setConfirmAction({ type: 'approve', ids: [...selectedIds] })
                }
              >
                選択を一括承認 ({selectedIds.size})
              </Button>
              <Button
                size="sm"
                variant="danger"
                onClick={() =>
                  setConfirmAction({ type: 'reject', ids: [...selectedIds] })
                }
              >
                選択を一括却下 ({selectedIds.size})
              </Button>
            </div>
          )}
        </div>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="flex justify-center py-8">
            <Spinner />
          </div>
        ) : error ? (
          <p className="text-sm text-red-600 py-4">{error}</p>
        ) : entries.length === 0 ? (
          <p className="text-sm text-gray-500 py-4">承認待ちのエントリーはありません。</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead>
                <tr className="border-b border-gray-200">
                  <th className="px-3 py-2">
                    <input
                      type="checkbox"
                      checked={allSelected}
                      onChange={(e) => handleSelectAll(e.target.checked)}
                      className="rounded border-gray-300"
                    />
                  </th>
                  <th className="px-3 py-2 text-xs font-medium text-gray-500 uppercase">物件コード</th>
                  <th className="px-3 py-2 text-xs font-medium text-gray-500 uppercase">保守会社</th>
                  <th className="px-3 py-2 text-xs font-medium text-gray-500 uppercase">点検種別</th>
                  <th className="px-3 py-2 text-xs font-medium text-gray-500 uppercase">作成日</th>
                  <th className="px-3 py-2 text-xs font-medium text-gray-500 uppercase">操作</th>
                </tr>
              </thead>
              <tbody>
                {entries.map((entry) => (
                  <PendingEntryRow
                    key={entry.id}
                    entry={entry}
                    selected={selectedIds.has(entry.id)}
                    onSelect={handleSelect}
                    onDetail={setDetailEntry}
                    onApprove={(id) => setConfirmAction({ type: 'approve', ids: [id] })}
                    onReject={(id) => setConfirmAction({ type: 'reject', ids: [id] })}
                  />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>

      <EntryDetailModal
        entry={detailEntry}
        open={!!detailEntry}
        onClose={() => setDetailEntry(null)}
      />

      <ConfirmDialog
        open={!!confirmAction}
        onClose={() => setConfirmAction(null)}
        onConfirm={handleConfirm}
        title={confirmAction?.type === 'approve' ? '承認確認' : '却下確認'}
        message={
          confirmAction?.type === 'approve'
            ? `${confirmAction.ids.length}件のエントリーを承認しますか？ステータスが「ready」に変更されます。`
            : `${confirmAction?.ids.length ?? 0}件のエントリーを却下しますか？データは削除されます。`
        }
        confirmLabel={confirmAction?.type === 'approve' ? '承認' : '却下'}
        variant={confirmAction?.type === 'approve' ? 'primary' : 'danger'}
      />
    </Card>
  );
}
