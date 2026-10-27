import { useEffect, useMemo, useRef, useState } from 'react';
import type { PortalInspectionRow, DbInspectionReport } from '@/types/portal';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { TextArea } from '@/components/ui/TextArea';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { Badge } from '@/components/ui/Badge';
import { useAuth } from '@/hooks/useAuth';
import { useToast } from '@/components/ui/Toast';
import { cn } from '@/lib/utils';
import {
  fetchInspectionReports,
  registerInspectionReport,
  sha256Hex,
  updateInspectionReport,
} from '@/lib/api/portal';
import { entryErrorReason } from '@/lib/api/admin-entries';
import { formatMonth, monthOf, todayJst } from '@/features/inspection-portal/lib/schedule';
import { buildReportFileName } from '../lib/fileName';
import { identicalReports } from '../lib/bulkSegments';
import { checkUpload } from '../lib/upload';
import { LIVE_STATUSES, REPORT_STATUS, formatBytes } from '../lib/documents';
import { FilePreview } from './FilePreview';
import { StoredReportPreview } from './StoredReportPreview';

/**
 * 点検報告書のアップロード（保守会社・管理者）。点検一覧の行から開く。
 * 建物名・点検種別は inspection から、実施日は入力から取り、ファイル名を buildReportFileName で作って見せる。
 * 1つの点検 × 対象月に報告書を複数持てる（修正依頼1027 決定①）。再提出は前の版を置き換えず追加する。
 * 左に選んだファイル（無ければ登録済みのファイル）のプレビュー、右に登録済みの報告書の一覧（管理者は各ファイルを削除できる。決定②）と入力欄。
 * 見出しを引いて動かせる（後ろの一覧の点検開始日などを見ながら入れられるように）
 */
export interface ReportUploadModalProps {
  open: boolean;
  onClose: () => void;
  inspection: PortalInspectionRow | null;
  /** 何月分の点検か（YYYY-MM-01）。点検月の無い点検行から開いたときは null（実施日の月になる） */
  targetMonth: string | null;
  /** 紐付ける申請（任意） */
  entryId?: string | null;
  /** 差戻し後の再提出なら元の報告書（差戻し理由を見せる） */
  previous?: DbInspectionReport | null;
  /** 実施日の既定（行の点検開始日。修正依頼1027(1)）。無ければ前の版の実施日、それも無ければ空 */
  defaultPerformedOn?: string | null;
  onUploaded: (report: DbInspectionReport) => void;
  /** 登録済みの報告書を削除したとき（管理者）。一覧の状態を読み直す */
  onDeleted?: () => void;
}

export function ReportUploadModal({
  open,
  onClose,
  inspection,
  targetMonth,
  entryId,
  previous,
  defaultPerformedOn,
  onUploaded,
  onDeleted,
}: ReportUploadModalProps) {
  const { addToast } = useToast();
  const { isAdmin } = useAuth();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [performedOn, setPerformedOn] = useState(() => (open ? defaultPerformedOn || previous?.performed_on || '' : ''));
  const [note, setNote] = useState('');
  const [touched, setTouched] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [duplicateOf, setDuplicateOf] = useState<DbInspectionReport | null>(null);
  /** 範囲内の報告書（開いたときに読む。登録済みの一覧に使う）。null は読み込み中 */
  const [allReports, setAllReports] = useState<DbInspectionReport[] | null>(null);
  const [reportsError, setReportsError] = useState<string | null>(null);
  /** プレビューに出す登録済みの報告書（null なら選んだファイル、それも無ければ一覧の先頭） */
  const [previewId, setPreviewId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<DbInspectionReport | null>(null);
  const [deletingBusy, setDeletingBusy] = useState(false);

  // 開き直したら前回の入力を消す（親が開いたまま別の行で開き直すこともあるので open の変化で合わせる）
  const [prevOpen, setPrevOpen] = useState(open);
  if (open !== prevOpen) {
    setPrevOpen(open);
    if (open) {
      setFile(null);
      // 実施日の既定は行の点検開始日（修正依頼1027(1)）。無ければ前の版の実施日（多くは同じ点検の書類の差し替え）
      setPerformedOn(defaultPerformedOn || previous?.performed_on || '');
      setNote('');
      setTouched(false);
      setDuplicateOf(null);
      setAllReports(null);
      setReportsError(null);
      setPreviewId(null);
      setDeleting(null);
    }
  }

  // 開いたら登録済みの報告書を読む（同じ点検・対象月の版を並べる）
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    fetchInspectionReports()
      .then((rows) => {
        if (!cancelled) setAllReports(rows);
      })
      .catch((err: unknown) => {
        if (!cancelled) setReportsError(entryErrorReason(err));
      });
    return () => {
      cancelled = true;
    };
  }, [open]);

  const today = todayJst();
  const check = checkUpload({ file, performedOn }, today);
  // ファイルの問題は選んだ時点で見せる。実施日の未入力は送信を押してから
  const fileError = file || touched ? check.errors.file : undefined;
  const performedOnError = touched ? check.errors.performedOn : undefined;
  const effectiveMonth = targetMonth ?? (performedOn ? monthOf(performedOn) : null);
  const previewName =
    inspection && performedOn
      ? buildReportFileName({
          performedOn,
          propertyName: inspection.property_name,
          inspectionTypeLabel: inspection.inspection_type_label ?? '',
        })
      : '';
  const isResubmit = !!previous;
  const dirty = !!file || !!note.trim();
  const inspectionId = inspection?.inspection_id ?? null;
  // 同じ点検・対象月の登録済みの報告書（提出・受領・差戻し。新しい順）
  const existing = useMemo(
    () =>
      (allReports ?? [])
        .filter(
          (r) =>
            r.property_inspection_id === inspectionId &&
            !!effectiveMonth &&
            r.target_month === effectiveMonth &&
            LIVE_STATUSES.includes(r.status),
        )
        .sort((a, b) => b.created_at.localeCompare(a.created_at)),
    [allReports, inspectionId, effectiveMonth],
  );
  const previewReport =
    (previewId ? existing.find((r) => r.id === previewId) : null) ??
    (file ? null : (existing[0] ?? null));

  const pickFile = (picked: File | undefined | null) => {
    if (!picked) return;
    setFile(picked);
    setPreviewId(null); // 選んだファイルをプレビューに出す
  };

  const deleteReport = async (target: DbInspectionReport) => {
    setDeletingBusy(true);
    try {
      const updated = await updateInspectionReport(target.id, 'delete');
      setAllReports((prev) => prev?.map((r) => (r.id === updated.id ? updated : r)) ?? prev);
      if (previewId === target.id) setPreviewId(null);
      addToast('報告書を削除しました', 'success');
      onDeleted?.();
    } catch (err) {
      addToast(`報告書の削除に失敗しました: ${entryErrorReason(err)}`, 'error');
    } finally {
      setDeletingBusy(false);
    }
  };

  const register = async () => {
    if (!inspection || !file) return;
    setSubmitting(true);
    try {
      const report = await registerInspectionReport({
        inspectionId: inspection.inspection_id,
        targetMonth,
        performedOn,
        fileName: previewName,
        file,
        entryId: entryId ?? null,
        note: note.trim() || null,
      });
      addToast(isResubmit ? '報告書を再提出しました' : '報告書を提出しました', 'success');
      onUploaded(report);
      onClose();
    } catch (err) {
      addToast(`報告書の提出に失敗しました: ${entryErrorReason(err)}`, 'error');
    } finally {
      setSubmitting(false);
    }
  };

  const handleSubmit = async () => {
    setTouched(true);
    if (!inspection || check.errors.file || check.errors.performedOn || !file) return;
    setSubmitting(true);
    try {
      // 同じファイルを同じ点検へ二重に出していないか（削除済みは数えない）
      const [hash, existing] = await Promise.all([sha256Hex(file), fetchInspectionReports()]);
      const dup = identicalReports(existing, inspection.inspection_id, hash)[0];
      if (dup) {
        setDuplicateOf(dup);
        setSubmitting(false);
        return;
      }
    } catch (err) {
      setSubmitting(false);
      addToast(`提出前の確認に失敗しました: ${entryErrorReason(err)}`, 'error');
      return;
    }
    await register();
  };

  return (
    <>
      <Modal
        open={open}
        onClose={onClose}
        title={isResubmit ? '報告書の再提出' : '報告書の提出'}
        // 左にプレビュー、右に入力欄（修正依頼1027(1)）。見出しを引いて動かせる（既定は中央）
        className="max-w-5xl"
        draggable
        dirty={dirty && !submitting}
        // 送信の途中で閉じると、提出の結果（成功・失敗の知らせ）が閉じた後に届いてしまう
        busy={submitting}
        footer={
          <>
            <Button variant="secondary" size="sm" onClick={onClose} disabled={submitting}>
              キャンセル
            </Button>
            <Button
              size="sm"
              onClick={() => void handleSubmit()}
              disabled={submitting || !inspection}
            >
              {submitting ? '送信中…' : isResubmit ? '再提出する' : '提出する'}
            </Button>
          </>
        }
      >
        <div className="grid gap-3 text-sm md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
          <div className="min-w-0 space-y-1">
            <p className="text-xs font-medium text-gray-600">
              {previewReport
                ? `登録済みのファイル: ${previewReport.file_name}`
                : file
                  ? `選んだファイル: ${file.name}`
                  : 'プレビュー'}
            </p>
            {previewReport ? (
              <StoredReportPreview report={previewReport} />
            ) : (
              <FilePreview file={file} />
            )}
          </div>
          <div className="min-w-0 space-y-2">
            {inspection && (
              <dl className="grid grid-cols-[5rem_1fr] gap-x-2 gap-y-0.5 text-xs">
                <dt className="text-gray-500">建物</dt>
                <dd className="text-gray-900">{inspection.property_name}</dd>
                <dt className="text-gray-500">点検種別</dt>
                <dd className="text-gray-900">{inspection.inspection_type_label ?? '—'}</dd>
                <dt className="text-gray-500">対象月</dt>
                <dd className="text-gray-900">
                  {effectiveMonth ? formatMonth(effectiveMonth) : '—'}
                  {!targetMonth && <span className="ml-1 text-gray-400">（実施日の月）</span>}
                </dd>
              </dl>
            )}

            {previous?.status === 'returned' && previous.review_comment && (
              <p className="whitespace-pre-line rounded border border-red-200 bg-red-50 px-2 py-1 text-xs text-red-800">
                差戻し理由: {previous.review_comment}
              </p>
            )}

            <div>
              <p className="mb-0.5 text-xs font-medium text-gray-600">
                登録済みの報告書（{allReports ? `${existing.length}件` : '読み込み中'}）
              </p>
              {reportsError ? (
                <p className="text-xs text-red-600">
                  登録済みの報告書を読み込めませんでした（{reportsError}）
                </p>
              ) : existing.length > 0 ? (
                <ul
                  aria-label="登録済みの報告書"
                  className="divide-y divide-gray-100 rounded border border-gray-200 text-xs"
                >
                  {existing.map((r) => (
                    <li
                      key={r.id}
                      className={cn(
                        'flex items-center gap-1 px-1.5 py-0.5',
                        previewReport?.id === r.id && 'bg-blue-50',
                      )}
                    >
                      <button
                        type="button"
                        className="min-w-0 flex-1 truncate text-left text-blue-700 hover:underline"
                        title={`${r.file_name}（押すと左に表示）`}
                        onClick={() => setPreviewId(r.id)}
                      >
                        {r.file_name}
                      </button>
                      <Badge
                        variant={REPORT_STATUS[r.status].variant}
                        className="px-1.5 py-0 text-[11px]"
                      >
                        {REPORT_STATUS[r.status].label}
                      </Badge>
                      {/* 削除は管理者だけ（修正依頼1027 決定②。DB も管理者だけ） */}
                      {isAdmin && (
                        <button
                          type="button"
                          className="shrink-0 rounded px-1 text-red-700 hover:bg-red-50 disabled:opacity-50"
                          aria-label={`${r.file_name} を削除`}
                          disabled={deletingBusy || submitting}
                          onClick={() => setDeleting(r)}
                        >
                          削除
                        </button>
                      )}
                    </li>
                  ))}
                </ul>
              ) : (
                allReports && <p className="text-xs text-gray-400">まだありません</p>
              )}
              {(isResubmit || existing.length > 0) && (
                <p className="mt-0.5 text-[11px] text-gray-500">
                  登録済みの報告書は置き換えず、追加します（要らない版の削除は管理者が行います）。
                </p>
              )}
            </div>

            <div>
              <p className="mb-0.5 text-xs font-medium text-gray-600">報告書（PDF・50MB まで）</p>
              <div
                role="button"
                tabIndex={0}
                aria-label="PDF を選ぶ"
                onClick={() => fileInputRef.current?.click()}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    fileInputRef.current?.click();
                  }
                }}
                onDragOver={(e) => {
                  e.preventDefault();
                  setDragging(true);
                }}
                onDragLeave={() => setDragging(false)}
                onDrop={(e) => {
                  e.preventDefault();
                  setDragging(false);
                  pickFile(e.dataTransfer.files[0]);
                }}
                className={cn(
                  'cursor-pointer rounded-md border-2 border-dashed px-3 py-3 text-center text-xs',
                  dragging ? 'border-blue-400 bg-blue-50' : 'border-gray-300 hover:bg-gray-50',
                  fileError && 'border-red-400',
                )}
              >
                {file ? (
                  <span className="text-gray-800">
                    {file.name}（{formatBytes(file.size)}）
                  </span>
                ) : (
                  <span className="text-gray-500">
                    ここに PDF をドラッグするか、クリックして選んでください
                  </span>
                )}
              </div>
              <input
                ref={fileInputRef}
                type="file"
                accept="application/pdf,.pdf"
                className="hidden"
                data-testid="report-file-input"
                onChange={(e) => {
                  pickFile(e.target.files?.[0]);
                  e.target.value = '';
                }}
              />
              {fileError && <p className="mt-0.5 text-xs text-red-600">{fileError}</p>}
            </div>

            <Input
              label="実施日（必須）"
              id="report-performed-on"
              type="date"
              value={performedOn}
              max="9999-12-31"
              onChange={(e) => setPerformedOn(e.target.value)}
              error={performedOnError}
            />
            {check.warnings.map((w) => (
              <p key={w} className="text-xs text-yellow-700">
                {w}
              </p>
            ))}

            <TextArea
              label="メモ（任意）"
              id="report-note"
              rows={2}
              value={note}
              onChange={(e) => setNote(e.target.value)}
            />

            <div className="text-xs">
              <span className="text-gray-500">保存するファイル名: </span>
              <span className="break-all font-mono text-gray-900">
                {previewName || '（実施日を入れると表示されます）'}
              </span>
              <p className="text-gray-400">同じ名前があるときは末尾に _2 などが付きます。</p>
            </div>
          </div>
        </div>
      </Modal>

      <ConfirmDialog
        open={!!deleting}
        onClose={() => setDeleting(null)}
        onConfirm={() => {
          if (deleting) void deleteReport(deleting);
        }}
        title="報告書の削除"
        message={`「${deleting?.file_name ?? ''}」を削除しますか？\n点検報告書の画面の「削除済みも表示」から復元できます。`}
        confirmLabel="削除"
        variant="danger"
      />

      <ConfirmDialog
        open={!!duplicateOf}
        onClose={() => setDuplicateOf(null)}
        onConfirm={() => void register()}
        title="同じファイルがあります"
        message={`同じ内容のファイルがこの点検にすでに登録されています。\n（${duplicateOf?.file_name ?? ''}）\nこのまま提出しますか？`}
        confirmLabel="提出する"
      />
    </>
  );
}
