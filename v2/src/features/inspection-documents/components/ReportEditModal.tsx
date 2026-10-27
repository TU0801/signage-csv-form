import { useState } from 'react';
import type { DbInspectionReport } from '@/types/portal';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { TextArea } from '@/components/ui/TextArea';
import { useToast } from '@/components/ui/Toast';
import { updateInspectionReport } from '@/lib/api/portal';
import { entryErrorReason } from '@/lib/api/admin-entries';
import { buildReportFileName, isGeneratedFileName, normalizeEditedFileName } from '../lib/fileName';
import { StoredReportPreview } from './StoredReportPreview';

interface ReportEditModalProps {
  report: DbInspectionReport | null;
  onClose: () => void;
  onSaved: (report: DbInspectionReport) => void;
}

/**
 * 報告書の項目の修正（実施日・対象月・ファイル名・メモ）。表示名だけを変え、Storage のキーは変えない。
 * 同じ名前があれば DB 側で _2 などを付ける。
 * 実施日を変えたら名前の日付がずれないよう作り直す。ただし手で直した名前は黙って消さず、作り直すかを聞く。
 * 左に登録済みのファイルのプレビューを出す（建物の取り違えに気づけるように。修正依頼1027(2)。AI-OCR は使わない）
 */
export function ReportEditModal({ report, onClose, onSaved }: ReportEditModalProps) {
  const { addToast } = useToast();
  const [performedOn, setPerformedOn] = useState('');
  const [targetMonth, setTargetMonth] = useState('');
  const [fileName, setFileName] = useState('');
  const [note, setNote] = useState('');
  /** 今の名前が手で付けたものか（規則どおりの名前なら実施日の変更で黙って作り直してよい） */
  const [nameTouched, setNameTouched] = useState(false);
  /** 手で直した名前があるときに、実施日の変更で作り直す候補（確認の行に出す） */
  const [renameProposal, setRenameProposal] = useState<string | null>(null);
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
      setNameTouched(
        !isGeneratedFileName(report.file_name, {
          performedOn: report.performed_on,
          propertyName: report.property_name,
          inspectionTypeLabel: report.inspection_type_label,
        }),
      );
      setRenameProposal(null);
      setError(null);
    }
  }

  const dirty =
    !!report &&
    (performedOn !== report.performed_on ||
      targetMonth !== (report.target_month?.slice(0, 7) ?? '') ||
      fileName !== report.file_name ||
      note !== (report.note ?? ''));

  const nameFor = (date: string) =>
    report
      ? buildReportFileName({
          performedOn: date,
          propertyName: report.property_name,
          inspectionTypeLabel: report.inspection_type_label,
        })
      : '';

  const handlePerformedOnChange = (date: string) => {
    setPerformedOn(date);
    if (!date) return;
    if (nameTouched) setRenameProposal(nameFor(date));
    else setFileName(nameFor(date));
  };

  const regenerateName = () => {
    setFileName(nameFor(performedOn));
    setNameTouched(false);
    setRenameProposal(null);
  };

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
      // 左にプレビュー、右に入力欄。長いファイル名（建物名・点検種別は各50文字まで）が欄に収まるよう広げる
      className="max-w-5xl"
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
        <div className="grid gap-3 text-sm md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
          <StoredReportPreview report={report} />
          <div className="min-w-0 space-y-2">
            <p className="text-xs text-gray-500">
              {report.property_name}・{report.inspection_type_label}
            </p>
            <div className="grid grid-cols-2 gap-2">
              <Input
                label="実施日"
                id="report-edit-performed-on"
                type="date"
                value={performedOn}
                onChange={(e) => handlePerformedOnChange(e.target.value)}
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
              {/* 名前は長いので欄を全幅にし、作り直すボタンは下に置く */}
              <Input
                label="ファイル名"
                id="report-edit-file-name"
                value={fileName}
                onChange={(e) => {
                  setFileName(e.target.value);
                  setNameTouched(true);
                }}
              />
              {renameProposal && renameProposal !== fileName && (
                <div
                  role="status"
                  className="flex flex-wrap items-center gap-1 rounded bg-amber-50 px-1.5 py-1 text-xs text-amber-900"
                >
                  <span className="min-w-0 break-all">
                    実施日を変えました。手で直したファイル名を「{renameProposal}」に作り直しますか？
                  </span>
                  <Button
                    variant="secondary"
                    size="sm"
                    type="button"
                    className="text-xs"
                    onClick={regenerateName}
                  >
                    作り直す
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    type="button"
                    className="text-xs"
                    onClick={() => setRenameProposal(null)}
                  >
                    このまま
                  </Button>
                </div>
              )}
              <div className="flex flex-wrap items-center gap-2">
                <Button
                  variant="secondary"
                  size="sm"
                  type="button"
                  className="text-xs"
                  disabled={!performedOn}
                  onClick={regenerateName}
                >
                  ファイル名を作り直す
                </Button>
                <p className="text-xs text-gray-400">
                  実施日を変えると名前の日付も作り直します（手で直した名前は、作り直すかを確かめます）。
                </p>
              </div>
            </div>
            <TextArea
              label="メモ"
              id="report-edit-note"
              rows={2}
              value={note}
              onChange={(e) => setNote(e.target.value)}
            />
            {error && <p className="text-xs text-red-600">{error}</p>}
          </div>
        </div>
      )}
    </Modal>
  );
}
