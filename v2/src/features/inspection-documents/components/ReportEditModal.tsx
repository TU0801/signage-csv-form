import { useState } from 'react';
import type { DbInspectionReport } from '@/types/portal';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { TextArea } from '@/components/ui/TextArea';
import { useToast } from '@/components/ui/Toast';
import { updateInspectionReport } from '@/lib/api/portal';
import { entryErrorReason } from '@/lib/api/admin-entries';
import { buildReportFileName, normalizeEditedFileName } from '../lib/fileName';

interface ReportEditModalProps {
  report: DbInspectionReport | null;
  onClose: () => void;
  onSaved: (report: DbInspectionReport) => void;
}

/**
 * 報告書の項目の修正（実施日・対象月・ファイル名・メモ）。表示名だけを変え、Storage のキーは変えない。
 * 同じ名前があれば DB 側で _2 などを付ける
 */
export function ReportEditModal({ report, onClose, onSaved }: ReportEditModalProps) {
  const { addToast } = useToast();
  const [performedOn, setPerformedOn] = useState('');
  const [targetMonth, setTargetMonth] = useState('');
  const [fileName, setFileName] = useState('');
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [prevId, setPrevId] = useState<string | null>(null);
  if ((report?.id ?? null) !== prevId) {
    setPrevId(report?.id ?? null);
    if (report) {
      setPerformedOn(report.performed_on);
      setTargetMonth(report.target_month?.slice(0, 7) ?? '');
      setFileName(report.file_name);
      setNote(report.note ?? '');
      setError(null);
    }
  }

  const dirty =
    !!report &&
    (performedOn !== report.performed_on ||
      targetMonth !== (report.target_month?.slice(0, 7) ?? '') ||
      fileName !== report.file_name ||
      note !== (report.note ?? ''));

  const handleSave = async () => {
    if (!report) return;
    if (!performedOn) {
      setError('実施日を入力してください');
      return;
    }
    // RPC は null を「変えない」と扱い対象月を消せないので、空にした場合は黙って元に戻さず止める
    if (!targetMonth && report.target_month) {
      setError('対象月を入力してください');
      return;
    }
    const normalized = normalizeEditedFileName(fileName);
    if (!normalized) {
      setError('ファイル名を入力してください');
      return;
    }
    setSaving(true);
    try {
      const saved = await updateInspectionReport(report.id, 'edit', {
        performedOn,
        targetMonth: targetMonth ? `${targetMonth}-01` : null,
        fileName: normalized,
        // 空にしたメモは DB 側で消える（null は「変えない」の意味なので空文字で送る）
        note,
      });
      addToast('報告書を更新しました', 'success');
      onSaved(saved);
      onClose();
    } catch (err) {
      addToast(`報告書の更新に失敗しました: ${entryErrorReason(err)}`, 'error');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      open={!!report}
      onClose={onClose}
      title="報告書の編集"
      dirty={dirty && !saving}
      footer={
        <>
          <Button variant="secondary" size="sm" onClick={onClose} disabled={saving}>
            キャンセル
          </Button>
          <Button size="sm" onClick={() => void handleSave()} disabled={saving}>
            {saving ? '保存中…' : '保存'}
          </Button>
        </>
      }
    >
      {report && (
        <div className="space-y-2 text-sm">
          <p className="text-xs text-gray-500">
            {report.property_name}・{report.inspection_type_label}
          </p>
          <div className="grid grid-cols-2 gap-2">
            <Input
              label="実施日"
              id="report-edit-performed-on"
              type="date"
              value={performedOn}
              onChange={(e) => setPerformedOn(e.target.value)}
            />
            <Input
              label="対象月"
              id="report-edit-target-month"
              type="month"
              value={targetMonth}
              onChange={(e) => setTargetMonth(e.target.value)}
            />
          </div>
          <div className="space-y-0.5">
            <div className="flex items-end gap-1">
              <div className="flex-1">
                <Input
                  label="ファイル名"
                  id="report-edit-file-name"
                  value={fileName}
                  onChange={(e) => setFileName(e.target.value)}
                />
              </div>
              <Button
                variant="secondary"
                size="sm"
                type="button"
                disabled={!performedOn}
                onClick={() =>
                  setFileName(
                    buildReportFileName({
                      performedOn,
                      propertyName: report.property_name,
                      inspectionTypeLabel: report.inspection_type_label,
                    }),
                  )
                }
              >
                ファイル名を作り直す
              </Button>
            </div>
            <p className="text-xs text-gray-400">実施日を直したときは「作り直す」で名前の日付も合わせてください。</p>
          </div>
          <TextArea label="メモ" id="report-edit-note" rows={2} value={note} onChange={(e) => setNote(e.target.value)} />
          {error && <p className="text-xs text-red-600">{error}</p>}
        </div>
      )}
    </Modal>
  );
}
