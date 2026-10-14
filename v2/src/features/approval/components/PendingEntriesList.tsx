import { useState, useEffect, useCallback, useMemo } from 'react';
import { Button } from '@/components/ui/Button';
import { Spinner } from '@/components/ui/Spinner';
import { Card, CardHeader, CardContent } from '@/components/ui/Card';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { useToast } from '@/components/ui/Toast';
import { entryErrorReason } from '@/lib/api/admin-entries';
import { EntryEditModal } from '@/features/entries-list/components/EntryEditModal';
import { useEntryLookups } from '@/features/entries-list/hooks/useEntryLookups';
import type { DbEntry } from '@/types/database';
import { PendingEntryRow } from './PendingEntryRow';
import { EntryDetailModal } from './EntryDetailModal';
import { usePendingEntries } from '../hooks/usePendingEntries';

type PendingConfirm = { kind: 'approve'; id: string } | { kind: 'reject'; id: string } | { kind: 'bulk' };

const th = 'px-3 py-3 text-xs font-medium text-gray-500 whitespace-nowrap';

/** データ承認待ち（申請済み = draft）。編集して保存すると承認になる */
// v1: js/admin-pending.js / admin.html #approval-data
export function PendingEntriesList() {
  const { entries, loading, error, fetchPendingEntries, approveEntry, rejectEntry, approveBulk } =
    usePendingEntries();
  const lookups = useEntryLookups();
  const { addToast } = useToast();

  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [detailEntry, setDetailEntry] = useState<DbEntry | null>(null);
  const [editEntry, setEditEntry] = useState<DbEntry | null>(null);
  const [confirm, setConfirm] = useState<PendingConfirm | null>(null);

  useEffect(() => {
    fetchPendingEntries();
  }, [fetchPendingEntries]);

  // 読み直した一覧に無い行は選択から外す
  const selected = useMemo(
    () => entries.filter((e) => selectedIds.has(e.id)).map((e) => e.id),
    [entries, selectedIds],
  );
  const allSelected = entries.length > 0 && selected.length === entries.length;

  const handleToggleAll = useCallback(() => {
    setSelectedIds(allSelected ? new Set() : new Set(entries.map((e) => e.id)));
  }, [allSelected, entries]);

  // v1: js/admin-pending.js updateSelectedPending
  const handleToggleSelect = useCallback((id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  // v1: js/admin-pending.js approveSingle
  const handleApprove = useCallback(
    async (id: string) => {
      try {
        await approveEntry(id);
        addToast('承認しました', 'success');
      } catch (err) {
        console.error('Failed to approve entry:', err);
        addToast(`承認に失敗しました: ${entryErrorReason(err)}`, 'error');
      }
    },
    [approveEntry, addToast],
  );

  // v1: js/admin-pending.js rejectSingle（却下は削除。v1 の却下理由の入力は保存されないため置かない）
  const handleReject = useCallback(
    async (id: string) => {
      try {
        await rejectEntry(id);
        addToast('却下しました', 'success');
      } catch (err) {
        console.error('Failed to reject entry:', err);
        addToast(`却下に失敗しました: ${entryErrorReason(err)}`, 'error');
      }
    },
    [rejectEntry, addToast],
  );

  // v1: js/admin-pending.js approveSelected
  const handleBulkApprove = useCallback(async () => {
    const ids = selected;
    if (ids.length === 0) return;
    try {
      await approveBulk(ids);
      setSelectedIds(new Set());
      addToast(`${ids.length}件を承認しました`, 'success');
    } catch (err) {
      console.error('Failed to approve entries:', err);
      addToast(`承認に失敗しました: ${entryErrorReason(err)}`, 'error');
    }
  }, [approveBulk, selected, addToast]);

  const confirmProps =
    confirm?.kind === 'reject'
      ? {
          title: '却下',
          message: 'この申請を却下しますか？（申請データは削除されます）',
          confirmLabel: '却下する',
          variant: 'danger' as const,
        }
      : confirm?.kind === 'bulk'
        ? {
            title: '一括承認',
            message: `選択した${selected.length}件を承認しますか？`,
            confirmLabel: '承認する',
            variant: 'primary' as const,
          }
        : {
            title: '承認',
            message: 'この申請を承認しますか？',
            confirmLabel: '承認する',
            variant: 'primary' as const,
          };

  return (
    <>
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-gray-900">
              データ承認待ち ({entries.length}件)
            </h2>
            <Button
              size="sm"
              variant="success"
              disabled={selected.length === 0}
              onClick={() => setConfirm({ kind: 'bulk' })}
            >
              一括承認
            </Button>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {error ? (
            <div className="px-6 py-6">
              <p className="text-red-600">{error}</p>
              <Button variant="secondary" size="sm" onClick={fetchPendingEntries} className="mt-2">
                再読み込み
              </Button>
            </div>
          ) : loading && entries.length === 0 ? (
            <div className="flex justify-center py-12">
              <Spinner size="lg" />
            </div>
          ) : entries.length === 0 ? (
            <p className="px-6 py-8 text-center text-sm text-gray-500">
              承認待ちのデータはありません
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left">
                <thead>
                  <tr className="border-b border-gray-200 bg-gray-50">
                    <th className={th}>
                      <input
                        type="checkbox"
                        aria-label="すべて選択"
                        checked={allSelected}
                        onChange={handleToggleAll}
                        className="h-4 w-4 rounded border-gray-300 text-blue-600"
                      />
                    </th>
                    <th className={th}>物件コード</th>
                    <th className={th}>物件名</th>
                    <th className={th}>点検種別</th>
                    <th className={th}>点検開始日</th>
                    <th className={th}>点検終了日</th>
                    <th className={th}>備考</th>
                    <th className={th}>保守会社</th>
                    <th className={th}>登録日時</th>
                    <th className={th}>登録者</th>
                    <th className={th}>操作</th>
                  </tr>
                </thead>
                <tbody>
                  {entries.map((entry) => (
                    <PendingEntryRow
                      key={entry.id}
                      entry={entry}
                      selected={selectedIds.has(entry.id)}
                      propertyName={lookups.propertyNames.get(entry.property_code)}
                      email={lookups.emailOf(entry.user_id)}
                      onToggleSelect={handleToggleSelect}
                      onApprove={(id) => setConfirm({ kind: 'approve', id })}
                      onReject={(id) => setConfirm({ kind: 'reject', id })}
                      onViewDetail={setDetailEntry}
                      onEdit={setEditEntry}
                    />
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      <EntryDetailModal
        entry={detailEntry}
        onClose={() => setDetailEntry(null)}
        emailOf={lookups.emailOf}
        displayDefault={lookups.displayDefault}
      />

      <EntryEditModal
        entry={editEntry}
        mode="pending"
        onClose={() => setEditEntry(null)}
        onSaved={fetchPendingEntries}
        propertyNames={lookups.propertyNames}
        displayDefault={lookups.displayDefault}
      />

      <ConfirmDialog
        open={confirm !== null}
        onClose={() => setConfirm(null)}
        onConfirm={() => {
          if (!confirm) return;
          if (confirm.kind === 'approve') void handleApprove(confirm.id);
          else if (confirm.kind === 'reject') void handleReject(confirm.id);
          else void handleBulkApprove();
        }}
        {...confirmProps}
      />
    </>
  );
}
