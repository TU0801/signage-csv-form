import { useRef, useState } from 'react';
import type { PortalInspectionRow, DbInspectionReport } from '@/types/portal';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { TextArea } from '@/components/ui/TextArea';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { useToast } from '@/components/ui/Toast';
import { cn } from '@/lib/utils';
import { fetchInspectionReports, registerInspectionReport, sha256Hex } from '@/lib/api/portal';
import { entryErrorReason } from '@/lib/api/admin-entries';
import { formatMonth, monthOf, todayJst } from '@/features/inspection-portal/lib/schedule';
import { buildReportFileName } from '../lib/fileName';
import { identicalReports } from '../lib/bulkSegments';
import { checkUpload } from '../lib/upload';
import { formatBytes } from '../lib/documents';

/**
 * 点検報告書のアップロード（保守会社・管理者）。点検一覧の行から開く。
 * 建物名・点検種別は inspection から、実施日は入力から取り、ファイル名を buildReportFileName で作って見せる
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
  onUploaded: (report: DbInspectionReport) => void;
}

export function ReportUploadModal({
  open,
  onClose,
  inspection,
  targetMonth,
  entryId,
  previous,
  onUploaded,
}: ReportUploadModalProps) {
  const { addToast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [performedOn, setPerformedOn] = useState('');
  const [note, setNote] = useState('');
  const [touched, setTouched] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [duplicateOf, setDuplicateOf] = useState<DbInspectionReport | null>(null);

  // 開き直したら前回の入力を消す（親が開いたまま別の行で開き直すこともあるので open の変化で合わせる）
  const [prevOpen, setPrevOpen] = useState(open);
  if (open !== prevOpen) {
    setPrevOpen(open);
    if (open) {
      setFile(null);
      // 再提出は前の版の実施日を初期値にする（多くは同じ点検の書類の差し替え）
      setPerformedOn(previous?.performed_on ?? '');
      setNote('');
      setTouched(false);
      setDuplicateOf(null);
    }
  }

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

  const pickFile = (picked: File | undefined | null) => {
    if (picked) setFile(picked);
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
        dirty={dirty && !submitting}
        // 送信の途中で閉じると、提出の結果（成功・失敗の知らせ）が閉じた後に届いてしまう
        busy={submitting}
        footer={
          <>
            <Button variant="secondary" size="sm" onClick={onClose} disabled={submitting}>
              キャンセル
            </Button>
            <Button size="sm" onClick={() => void handleSubmit()} disabled={submitting || !inspection}>
              {submitting ? '送信中…' : isResubmit ? '再提出する' : '提出する'}
            </Button>
          </>
        }
      >
        <div className="space-y-2 text-sm">
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

          {previous && (
            <div className="rounded border border-red-200 bg-red-50 px-2 py-1.5 text-xs text-red-800">
              <p>前の版: {previous.file_name}</p>
              {previous.status === 'returned' && previous.review_comment && <p className="mt-0.5 whitespace-pre-line">差戻し理由: {previous.review_comment}</p>}
              <p className="mt-0.5 text-red-700">提出すると前の版は「置き換え済み」になります。</p>
            </div>
          )}

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
                <span className="text-gray-500">ここに PDF をドラッグするか、クリックして選んでください</span>
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
            <span className="break-all font-mono text-gray-900">{previewName || '（実施日を入れると表示されます）'}</span>
            <p className="text-gray-400">同じ名前があるときは末尾に _2 などが付きます。</p>
          </div>
        </div>
      </Modal>

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
