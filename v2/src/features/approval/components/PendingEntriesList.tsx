import { useState, useEffect, useCallback, useMemo } from 'react';
import { Button } from '@/components/ui/Button';
import { Spinner } from '@/components/ui/Spinner';
import { Card, CardHeader, CardContent } from '@/components/ui/Card';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { useToast } from '@/components/ui/Toast';
import { useAuthStore } from '@/stores/authStore';
import { SendBackDialog } from '@/features/inspection-portal/components/SendBackDialog';
import { entryErrorReason, STALE_ENTRY_MESSAGE } from '@/lib/api/admin-entries';
import { bulkApproveMessage } from '../lib/bulkApproveMessage';
import { EntryEditModal } from '@/features/entries-list/components/EntryEditModal';
import { useEntryLookups } from '@/features/entries-list/hooks/useEntryLookups';
import { NAME_COL } from '@/features/entries-list/lib/tableColumns';
import { formatJaDate } from '@/features/entries-list/lib/entries';
import type { DbEntry } from '@/types/database';
import { fetchPropertyRequestsByIds } from '@/lib/api/property-requests';
import { isProvisionalCode } from '@/features/building-requests/lib/provisional';
import { PendingEntryRow } from './PendingEntryRow';
import { EntryDetailModal } from './EntryDetailModal';
import { usePendingEntries } from '../hooks/usePendingEntries';
import { useRefetchOnVisible } from '../hooks/useRefetchOnVisible';
import { useUnitLabels } from '@/features/inspection-portal/hooks/useUnitLabels';

type PendingConfirm =
  | { kind: 'approve'; id: string }
  | { kind: 'reject'; id: string }
  | { kind: 'bulk' }
  | { kind: 'bulkReject' };

/** 確認ダイアログに一度に並べる対象の上限（多いときは「ほかN件」） */
const MAX_LISTED = 10;

const th = 'cell-head font-medium text-gray-500';
// 操作の列は右端に固定する（PendingEntryRow の操作セルと対）
const thActions = `${th} sticky right-0 bg-gray-50 shadow-[inset_1px_0_0_var(--color-gray-200)]`;

/** データ承認待ち（申請済み = draft）。編集して保存すると承認になる */
// v1: js/admin-pending.js / admin.html #approval-data
export function PendingEntriesList() {
  const {
    entries,
    loading,
    error,
    fetchPendingEntries,
    approveEntry,
    rejectEntry,
    approveBulk,
    rejectBulk,
    sendBackEntry,
  } = usePendingEntries();
  const lookups = useEntryLookups();
  // 台ごとの申請の台の No（修正依頼1026 I7）。台ごとの申請があるときだけ読み、読み込み済みに無い台が現れたら読み直す
  const unitIds = useMemo(() => entries.map((e) => e.property_unit_id), [entries]);
  const unitLabels = useUnitLabels(unitIds);
  const { addToast } = useToast();
  // 管理会社: 承認と差戻しだけ（却下＝削除・編集は管理者だけ）
  const isManagement = useAuthStore((s) => s.profile?.role === 'management');
  const [sendBackTarget, setSendBackTarget] = useState<DbEntry | null>(null);

  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [detailEntry, setDetailEntry] = useState<DbEntry | null>(null);
  const [editEntry, setEditEntry] = useState<DbEntry | null>(null);
  const [confirm, setConfirm] = useState<PendingConfirm | null>(null);

  useEffect(() => {
    fetchPendingEntries();
  }, [fetchPendingEntries]);

  // 未承認の建物（建物追加の申請）の掲示の申請: 建物名を出し、建物が承認されるまで承認させない（修正依頼1025 F2）
  const requestIds = useMemo(
    () =>
      [...new Set(entries.map((e) => e.property_request_id).filter((id): id is string => !!id))].sort().join(','),
    [entries],
  );
  const [requestNames, setRequestNames] = useState<ReadonlyMap<string, string>>(() => new Map());
  useEffect(() => {
    if (!requestIds) return;
    let cancelled = false;
    fetchPropertyRequestsByIds(requestIds.split(',')).then(
      (rows) => {
        if (!cancelled) setRequestNames(new Map(rows.map((r) => [r.id, r.property_name])));
      },
      (err) => console.error('Failed to load property requests:', err),
    );
    return () => {
      cancelled = true;
    };
  }, [requestIds]);
  /** 建物未承認の申請なら建物名（読めなければ空文字）、そうでなければ undefined */
  const pendingBuildingOf = useCallback(
    (entry: DbEntry): string | undefined =>
      isProvisionalCode(entry.property_code)
        ? (entry.property_request_id && requestNames.get(entry.property_request_id)) || ''
        : undefined,
    [requestNames],
  );

  // 別のタブから戻ったら読み直す（詳細・編集・確認を開いている間は読み直さない）
  useRefetchOnVisible(
    fetchPendingEntries,
    !loading && !detailEntry && !editEntry && confirm === null && !sendBackTarget,
  );

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

  // v1: js/admin-pending.js approveSelected。建物未承認の申請は承認できないので外す（断られて失敗の知らせになるため）。
  // 承認は版を比べて1件ずつ（修正依頼1026 I11）なので、一部だけ断られると残りは承認済みになり、断られた行は選択に残る
  const handleBulkApprove = useCallback(async () => {
    const blocked = entries.filter((e) => selected.includes(e.id) && pendingBuildingOf(e) !== undefined).map((e) => e.id);
    const ids = selected.filter((id) => !blocked.includes(id));
    if (ids.length === 0) {
      if (blocked.length > 0) addToast('建物未承認の申請は、建物が承認されるまで承認できません', 'error');
      return;
    }
    try {
      const { succeeded, failed, errors } = await approveBulk(ids);
      // 承認済みの行は読み直しで一覧から消える。断られた行（修正されていた行など）と建物未承認の行は選んだままにする
      if (failed === 0) setSelectedIds(new Set(blocked));
      else console.error('Failed to approve entries:', errors);
      const reasons = errors.map((e) => entryErrorReason(e));
      const others = reasons.filter((r) => r !== STALE_ENTRY_MESSAGE);
      const { message, tone } = bulkApproveMessage({
        succeeded,
        stale: reasons.length - others.length,
        otherFailed: others.length,
        otherReason: others[0] ?? '',
        blocked: blocked.length,
      });
      addToast(message, tone);
    } catch (err) {
      console.error('Failed to approve entries:', err);
      addToast(`承認に失敗しました: ${entryErrorReason(err)}`, 'error');
    }
  }, [approveBulk, selected, entries, pendingBuildingOf, addToast]);

  // 選択を却下（1件ずつの却下と同じく削除）
  const handleBulkReject = useCallback(async () => {
    const ids = selected;
    if (ids.length === 0) return;
    try {
      const { succeeded, failed, firstError } = await rejectBulk(ids);
      if (failed === 0) {
        setSelectedIds(new Set());
        addToast(`${succeeded}件を却下しました`, 'success');
        return;
      }
      // 却下済みの行は読み直しで一覧から消え、選択からも外れる。残った行（失敗分）は選んだままにする
      console.error('Failed to reject entries:', firstError);
      addToast(
        succeeded > 0
          ? `${succeeded}件を却下しました。${failed}件は却下できませんでした: ${entryErrorReason(firstError)}`
          : `却下に失敗しました: ${entryErrorReason(firstError)}`,
        'error',
      );
    } catch (err) {
      // 読み直しの失敗など
      console.error('Failed to reject entries:', err);
      addToast(`却下に失敗しました: ${entryErrorReason(err)}`, 'error');
    }
  }, [rejectBulk, selected, addToast]);

  const handleSendBack = useCallback(
    async (entry: DbEntry, reason: string) => {
      try {
        await sendBackEntry(entry.id, reason);
        addToast('差し戻しました', 'success');
      } catch (err) {
        console.error('Failed to send back entry:', err);
        addToast(`差戻しに失敗しました: ${entryErrorReason(err)}`, 'error');
        throw err;
      }
    },
    [sendBackEntry, addToast],
  );

  // 確認ダイアログに出す対象の1行（物件・点検種別・点検日）。却下は削除なので、何を消すかを確かめられるようにする
  const describeEntry = (entry: DbEntry) => {
    const name = lookups.propertyNames.get(entry.property_code) || '';
    return (
      `${entry.property_code} ${name} / ${entry.inspection_type || '-'} / ` +
      `点検日 ${formatJaDate(entry.inspection_start)}〜${formatJaDate(entry.inspection_end)}`
    );
  };
  const listTargets = (ids: string[]) => {
    const targets = entries.filter((e) => ids.includes(e.id));
    const lines = targets.slice(0, MAX_LISTED).map((e) => `・${describeEntry(e)}`);
    if (targets.length > MAX_LISTED) lines.push(`ほか${targets.length - MAX_LISTED}件`);
    return lines.join('\n');
  };

  const confirmProps =
    confirm?.kind === 'reject'
      ? {
          title: '却下',
          message: `この申請を却下しますか？（申請データは削除されます）\n${listTargets([confirm.id])}`,
          confirmLabel: '却下する',
          variant: 'danger' as const,
        }
      : confirm?.kind === 'bulkReject'
        ? {
            title: '選択を却下',
            message: `選択した${selected.length}件を却下しますか？（申請データは削除されます）\n${listTargets(selected)}`,
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
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h2 className="text-sm font-semibold text-gray-900">
                データ承認待ち ({entries.length}件)
              </h2>
              {/* 「却下」（削除）と「差戻し」（削除せず保守会社へ戻す）の結果の違いを言葉で示す（却下の挙動は v1 どおり） */}
              {isManagement ? (
                <p className="text-xs text-gray-500">
                  自社が管理する物件の申請だけを表示します。「差戻し」は申請を削除せず、理由を付けて保守会社へ戻します。
                </p>
              ) : (
                <p className="text-xs text-gray-500">
                  「却下」は申請データを削除します。「差戻し」は申請を削除せず、理由を付けて保守会社へ戻します。
                </p>
              )}
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {selected.length > 0 && (
                <span className="text-sm font-medium text-blue-800">{selected.length}件選択中</span>
              )}
              {!isManagement && (
                <Button
                  size="sm"
                  variant="danger"
                  disabled={selected.length === 0}
                  onClick={() => setConfirm({ kind: 'bulkReject' })}
                >
                  選択を却下
                </Button>
              )}
              <Button
                size="sm"
                variant="success"
                disabled={selected.length === 0}
                onClick={() => setConfirm({ kind: 'bulk' })}
              >
                一括承認
              </Button>
              {/* 開いている間に届いた申請は自動では出ないので、いつでも読み直せるようにする */}
              <Button size="sm" variant="ghost" onClick={fetchPendingEntries} disabled={loading}>
                {loading ? '読み込み中...' : '更新'}
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {error ? (
            <div className="p-3">
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
            <p className="px-3 py-6 text-center text-sm text-gray-500">
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
                    <th className={`${th} ${NAME_COL.property}`}>物件名</th>
                    <th className={`${th} ${NAME_COL.inspectionType}`}>点検種別</th>
                    <th className={th}>点検開始日</th>
                    <th className={th}>点検終了日</th>
                    <th className={th}>表示期間</th>
                    <th className={`${th} ${NAME_COL.remarks}`}>備考</th>
                    <th className={`${th} ${NAME_COL.vendor}`}>保守会社</th>
                    <th className={th}>登録日時</th>
                    <th className={`${th} ${NAME_COL.registrant}`}>登録者</th>
                    <th className={thActions}>操作</th>
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
                      onReject={isManagement ? undefined : (id) => setConfirm({ kind: 'reject', id })}
                      onViewDetail={setDetailEntry}
                      onEdit={isManagement ? undefined : setEditEntry}
                      onSendBack={setSendBackTarget}
                      pendingBuildingName={pendingBuildingOf(entry)}
                      unitCode={entry.property_unit_id ? (unitLabels.get(entry.property_unit_id) ?? '号機不明') : undefined}
                    />
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* 承認待ちから開いた詳細は、そのまま承認・却下・編集へ進める（確認ダイアログは一覧の行と同じ） */}
      <EntryDetailModal
        entry={detailEntry}
        onClose={() => setDetailEntry(null)}
        propertyNames={lookups.propertyNames}
        emailOf={lookups.emailOf}
        displayDefault={lookups.displayDefault}
        onApprove={
          detailEntry && pendingBuildingOf(detailEntry) !== undefined
            ? undefined
            : (e) => {
                setDetailEntry(null);
                setConfirm({ kind: 'approve', id: e.id });
              }
        }
        onReject={
          isManagement
            ? undefined
            : (e) => {
                setDetailEntry(null);
                setConfirm({ kind: 'reject', id: e.id });
              }
        }
        onEdit={
          isManagement
            ? undefined
            : (e) => {
                setDetailEntry(null);
                setEditEntry(e);
              }
        }
        onSendBack={(e) => {
          setDetailEntry(null);
          setSendBackTarget(e);
        }}
      />

      <SendBackDialog
        open={sendBackTarget !== null}
        subject={sendBackTarget ? describeEntry(sendBackTarget) : ''}
        onClose={() => setSendBackTarget(null)}
        onConfirm={(reason) => (sendBackTarget ? handleSendBack(sendBackTarget, reason) : Promise.resolve())}
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
          else if (confirm.kind === 'bulkReject') void handleBulkReject();
          else void handleBulkApprove();
        }}
        {...confirmProps}
      />
    </>
  );
}
