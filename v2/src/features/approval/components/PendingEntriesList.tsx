import { useState, useEffect, useCallback } from 'react';
import { Button } from '@/components/ui/Button';
import { Spinner } from '@/components/ui/Spinner';
import { Card, CardHeader, CardContent } from '@/components/ui/Card';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { useToast } from '@/components/ui/Toast';
import { PendingEntryRow } from './PendingEntryRow';
import { EntryDetailModal } from './EntryDetailModal';
import { usePendingEntries } from '../hooks/usePendingEntries';
import type { DbEntry } from '@/types/database';

export function PendingEntriesList() {
  const { entries, loading, error, fetchPendingEntries, approveEntry, rejectEntry, approveBulk } =
    usePendingEntries();
  const { addToast } = useToast();

  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [detailEntry, setDetailEntry] = useState<DbEntry | null>(null);
  const [confirmReject, setConfirmReject] = useState<string | null>(null);
  const [confirmBulk, setConfirmBulk] = useState(false);

  useEffect(() => {
    fetchPendingEntries();
  }, [fetchPendingEntries]);

  const allSelected = entries.length > 0 && selectedIds.size === entries.length;

  const handleToggleAll = useCallback(() => {
    if (allSelected) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(entries.map((e) => e.id)));
    }
  }, [allSelected, entries]);

  const handleToggleSelect = useCallback((id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }, []);

  const handleApprove = useCallback(
    async (id: string) => {
      try {
        await approveEntry(id);
        setSelectedIds((prev) => {
          const next = new Set(prev);
          next.delete(id);
          return next;
        });
        addToast('エントリーを承認しました', 'success');
      } catch {
        addToast('承認に失敗しました', 'error');
      }
    },
    [approveEntry, addToast],
  );

  const handleReject = useCallback(
    async (id: string) => {
      try {
        await rejectEntry(id);
        setSelectedIds((prev) => {
          const next = new Set(prev);
          next.delete(id);
          return next;
        });
        addToast('エントリーを却下しました', 'success');
      } catch {
        addToast('却下に失敗しました', 'error');
      }
    },
    [rejectEntry, addToast],
  );

  const handleBulkApprove = useCallback(async () => {
    try {
      const ids = [...selectedIds];
      await approveBulk(ids);
      setSelectedIds(new Set());
      addToast(`${ids.length}件のエントリーを承認しました`, 'success');
    } catch {
      addToast('一括承認に失敗しました', 'error');
    }
  }, [approveBulk, selectedIds, addToast]);

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
          <Button variant="secondary" size="sm" onClick={fetchPendingEntries} className="mt-2">
            再読み込み
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <>
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-gray-900">
              承認待ちエントリー ({entries.length}件)
            </h2>
            {selectedIds.size > 0 && (
              <Button size="sm" variant="success" onClick={() => setConfirmBulk(true)}>
                選択した{selectedIds.size}件を一括承認
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {entries.length === 0 ? (
            <p className="px-6 py-8 text-center text-sm text-gray-500">
              承認待ちのエントリーはありません
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left">
                <thead>
                  <tr className="border-b border-gray-200 bg-gray-50">
                    <th className="px-4 py-3">
                      <input
                        type="checkbox"
                        checked={allSelected}
                        onChange={handleToggleAll}
                        className="h-4 w-4 rounded border-gray-300 text-blue-600"
                      />
                    </th>
                    <th className="px-4 py-3 text-xs font-medium uppercase text-gray-500">
                      物件コード
                    </th>
                    <th className="px-4 py-3 text-xs font-medium uppercase text-gray-500">
                      端末ID
                    </th>
                    <th className="px-4 py-3 text-xs font-medium uppercase text-gray-500">
                      保守会社
                    </th>
                    <th className="px-4 py-3 text-xs font-medium uppercase text-gray-500">
                      点検種別
                    </th>
                    <th className="px-4 py-3 text-xs font-medium uppercase text-gray-500">
                      点検開始日
                    </th>
                    <th className="px-4 py-3 text-xs font-medium uppercase text-gray-500">
                      ステータス
                    </th>
                    <th className="px-4 py-3 text-xs font-medium uppercase text-gray-500">
                      操作
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {entries.map((entry) => (
                    <PendingEntryRow
                      key={entry.id}
                      entry={entry}
                      selected={selectedIds.has(entry.id)}
                      onToggleSelect={handleToggleSelect}
                      onApprove={handleApprove}
                      onReject={(id) => setConfirmReject(id)}
                      onViewDetail={setDetailEntry}
                    />
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      <EntryDetailModal
        open={detailEntry !== null}
        onClose={() => setDetailEntry(null)}
        entry={detailEntry}
      />

      <ConfirmDialog
        open={confirmReject !== null}
        onClose={() => setConfirmReject(null)}
        onConfirm={() => {
          if (confirmReject) handleReject(confirmReject);
        }}
        title="エントリー却下"
        message="このエントリーを却下してもよろしいですか？この操作は取り消せません。"
        confirmLabel="却下する"
        variant="danger"
      />

      <ConfirmDialog
        open={confirmBulk}
        onClose={() => setConfirmBulk(false)}
        onConfirm={handleBulkApprove}
        title="一括承認"
        message={`選択した${selectedIds.size}件のエントリーを承認してもよろしいですか？`}
        confirmLabel="承認する"
      />
    </>
  );
}
