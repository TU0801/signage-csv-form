import { useState } from 'react';
import type { DbInspectionReport } from '@/types/portal';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { useToast } from '@/components/ui/Toast';
import { cn } from '@/lib/utils';
import { updateInspectionReport } from '@/lib/api/portal';
import { entryErrorReason } from '@/lib/api/admin-entries';
import { formatMonth } from '@/features/inspection-portal/lib/schedule';
import { REPORT_STATUS, reportPermissions, type ReportViewer } from '../lib/documents';
import { buildReportFileName, isGeneratedFileName, normalizeEditedFileName } from '../lib/fileName';

interface RegisteredReportsPanelProps {
  /** 見出し（物件・点検種別・対象月） */
  heading: string;
  /** 登録済みの報告書（null は読み込み中） */
  reports: DbInspectionReport[] | null;
  viewer: ReportViewer;
  /** 左にプレビューしている報告書 */
  previewId: string | null;
  onPreview: (report: DbInspectionReport) => void;
  /** 最初から編集を開いておく報告書（点検報告書の画面の『編集』から開いたとき） */
  initialEditId?: string | null;
  /** 削除の確認を出す（確認ダイアログは親が持つ） */
  onDelete: (report: DbInspectionReport) => void;
  onSaved: (report: DbInspectionReport) => void;
  disabled?: boolean;
}

/**
 * 登録済みの報告書の一覧（修正依頼1029(1)。報告書の再提出・編集をファイルのアップロード画面に統一）。
 * 名前を押すと左にプレビュー、状態のバッジ、『編集』（実施日・対象月・ファイル名・メモ）、『削除』
 * （受領前は上げた保守会社も、受領後は管理者だけ。決定②）
 */
export function RegisteredReportsPanel({
  heading,
  reports,
  viewer,
  previewId,
  onPreview,
  initialEditId,
  onDelete,
  onSaved,
  disabled,
}: RegisteredReportsPanelProps) {
  const [editingId, setEditingId] = useState<string | null>(initialEditId ?? null);
  return (
    <section aria-label="登録済みの報告書" className="rounded border border-blue-200 bg-blue-50/40">
      <div className="flex flex-wrap items-center gap-x-2 border-b border-blue-100 px-2 py-0.5 text-xs">
        <span className="font-semibold text-gray-700">登録済みの報告書（{reports ? `${reports.length}件` : '読み込み中'}）</span>
        <span className="text-gray-600">{heading}</span>
        <span className="ml-auto text-[11px] text-gray-500">
          新しいファイルは置き換えず追加します。受領前は上げた保守会社も削除でき、受領後の削除は管理者が行います。
        </span>
      </div>
      {reports && reports.length === 0 && <p className="px-2 py-1 text-xs text-gray-400">まだありません</p>}
      {reports && reports.length > 0 && (
        <ul className="max-h-48 divide-y divide-blue-100 overflow-y-auto text-xs">
          {reports.map((r) => {
            const p = reportPermissions(r, viewer);
            return (
              <li key={r.id} className={cn(previewId === r.id && 'bg-blue-100/60')}>
                <div className="flex items-center gap-1 px-2 py-0.5">
                  <button
                    type="button"
                    className="min-w-0 flex-1 truncate text-left text-blue-700 hover:underline"
                    title={`${r.file_name}（押すと左に表示）`}
                    onClick={() => onPreview(r)}
                  >
                    {r.file_name}
                  </button>
                  <span className="shrink-0 text-gray-500">
                    実施 {r.performed_on.replace(/-/g, '/')}
                    {r.target_month && `・${formatMonth(r.target_month)}分`}
                  </span>
                  <Badge variant={REPORT_STATUS[r.status].variant} className="px-1.5 py-0 text-[11px]">
                    {REPORT_STATUS[r.status].label}
                  </Badge>
                  {p.canEdit && (
                    <button
                      type="button"
                      className="shrink-0 rounded px-1 text-blue-700 hover:bg-blue-100 disabled:opacity-50"
                      aria-label={`${r.file_name} を編集`}
                      aria-expanded={editingId === r.id}
                      disabled={disabled}
                      onClick={() => {
                        setEditingId((cur) => (cur === r.id ? null : r.id));
                        onPreview(r);
                      }}
                    >
                      編集
                    </button>
                  )}
                  {p.canDelete && (
                    <button
                      type="button"
                      className="shrink-0 rounded px-1 text-red-700 hover:bg-red-50 disabled:opacity-50"
                      aria-label={`${r.file_name} を削除`}
                      disabled={disabled}
                      onClick={() => onDelete(r)}
                    >
                      削除
                    </button>
                  )}
                </div>
                {editingId === r.id && (
                  <ReportEditForm
                    key={r.id}
                    report={r}
                    onCancel={() => setEditingId(null)}
                    onSaved={(saved) => {
                      setEditingId(null);
                      onSaved(saved);
                    }}
                  />
                )}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

/**
 * 報告書の項目の修正（実施日・対象月・ファイル名・メモ）。表示名だけを変え、Storage のキーは変えない。
 * 同じ名前があれば DB 側で _2 などを付ける。実施日を変えたら名前の日付がずれないよう作り直す。
 * ただし手で直した名前は黙って消さず、作り直すかを聞く（前の『報告書の編集』と同じ）
 */
function ReportEditForm({
  report,
  onCancel,
  onSaved,
}: {
  report: DbInspectionReport;
  onCancel: () => void;
  onSaved: (report: DbInspectionReport) => void;
}) {
  const { addToast } = useToast();
  const [performedOn, setPerformedOn] = useState(report.performed_on);
  const [targetMonth, setTargetMonth] = useState(report.target_month?.slice(0, 7) ?? '');
  const [fileName, setFileName] = useState(report.file_name);
  const [note, setNote] = useState(report.note ?? '');
  const [nameTouched, setNameTouched] = useState(
    () =>
      !isGeneratedFileName(report.file_name, {
        performedOn: report.performed_on,
        propertyName: report.property_name,
        inspectionTypeLabel: report.inspection_type_label,
      }),
  );
  const [renameProposal, setRenameProposal] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const nameFor = (date: string) =>
    buildReportFileName({ performedOn: date, propertyName: report.property_name, inspectionTypeLabel: report.inspection_type_label });

  const changePerformedOn = (date: string) => {
    setPerformedOn(date);
    if (!date) return;
    if (nameTouched) setRenameProposal(nameFor(date));
    else setFileName(nameFor(date));
  };
  const regenerate = () => {
    setFileName(nameFor(performedOn));
    setNameTouched(false);
    setRenameProposal(null);
  };

  const save = async () => {
    if (!performedOn) return setError('実施日を入力してください');
    // RPC は null を「変えない」と扱い対象月を消せないので、空にした場合は黙って元に戻さず止める
    if (!targetMonth && report.target_month) return setError('対象月を入力してください');
    const normalized = normalizeEditedFileName(fileName);
    if (!normalized) return setError('ファイル名を入力してください');
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
    } catch (err) {
      addToast(`報告書の更新に失敗しました: ${entryErrorReason(err)}`, 'error');
    } finally {
      setSaving(false);
    }
  };

  const field = 'rounded border border-gray-300 bg-white px-1 py-0.5 text-xs';
  return (
    <div className="space-y-1 border-t border-blue-100 bg-white px-2 py-1 text-xs" data-testid="report-edit-form">
      <div className="flex flex-wrap items-end gap-2">
        <label className="flex flex-col text-[11px] text-gray-600">
          実施日
          <input type="date" aria-label="報告書の実施日" className={field} value={performedOn} max="9999-12-31" onChange={(e) => changePerformedOn(e.target.value)} />
        </label>
        <label className="flex flex-col text-[11px] text-gray-600">
          対象月
          <input type="month" aria-label="報告書の対象月" className={field} value={targetMonth} onChange={(e) => setTargetMonth(e.target.value)} />
        </label>
        <label className="flex min-w-[16rem] flex-1 flex-col text-[11px] text-gray-600">
          ファイル名
          <input
            aria-label="報告書のファイル名"
            className={field}
            value={fileName}
            onChange={(e) => {
              setFileName(e.target.value);
              setNameTouched(true);
            }}
          />
        </label>
        <Button variant="secondary" size="sm" className="text-xs" disabled={!performedOn} onClick={regenerate}>
          ファイル名を作り直す
        </Button>
      </div>
      {renameProposal && renameProposal !== fileName && (
        <div role="status" className="flex flex-wrap items-center gap-1 rounded bg-amber-50 px-1.5 py-0.5 text-amber-900">
          <span className="min-w-0 break-all">実施日を変えました。手で直したファイル名を「{renameProposal}」に作り直しますか？</span>
          <Button variant="secondary" size="sm" className="text-xs" onClick={regenerate}>
            作り直す
          </Button>
          <Button variant="ghost" size="sm" className="text-xs" onClick={() => setRenameProposal(null)}>
            このまま
          </Button>
        </div>
      )}
      <div className="flex items-end gap-2">
        <label className="flex flex-1 flex-col text-[11px] text-gray-600">
          メモ
          <input aria-label="報告書のメモ" className={field} value={note} onChange={(e) => setNote(e.target.value)} />
        </label>
        <Button variant="secondary" size="sm" className="text-xs" onClick={onCancel} disabled={saving}>
          やめる
        </Button>
        <Button size="sm" className="text-xs" onClick={() => void save()} disabled={saving}>
          {saving ? '保存中…' : '保存'}
        </Button>
      </div>
      <p className="text-[11px] text-gray-400">実施日を変えると名前の日付も作り直します（手で直した名前は、作り直すかを確かめます）。</p>
      {error && <p className="text-red-600">{error}</p>}
    </div>
  );
}
