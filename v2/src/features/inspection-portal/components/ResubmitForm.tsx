import { useEffect, useMemo, useState } from 'react';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { TextArea } from '@/components/ui/TextArea';
import { Spinner } from '@/components/ui/Spinner';
import { useToast } from '@/components/ui/Toast';
import { templateFileUrl } from '@/lib/templateStorage';
import { discardOwnPosterImages } from '@/lib/storage';
import { followEndDate } from '@/lib/inspectionDates';
import { REMARKS_PLACEHOLDER, remarksNotice } from '@/lib/remarks';
import { remarksUsage } from '@/features/single-entry/lib/entryLogic';
import { resolveTemplateImageUrl } from '@/features/single-entry/lib/templateImages';
import { BasicEntryForm, normalizePosition, type BasicFormValues } from '@/features/bulk-entry/components/BasicEntryForm';
import { usePosterUploads } from '@/features/bulk-entry/hooks/usePosterUploads';
import { editRowInput } from '@/features/bulk-entry/utils/scheduleRows';
import { submittedDisplayPeriod, templateDisplayName } from '@/features/bulk-entry/utils/rowDetail';
import type { AppSettings } from '@/lib/api/single-entry';
import type { MasterData } from '@/types/app';
import type { DbEntry } from '@/types/database';
import type { PortalEntryRow } from '@/types/portal';
import {
  buildApplyRow,
  startOutsideTargetMonth,
  toResubmitPatch,
  type ApplyContext,
  type ResubmitPatch,
} from '../lib/applyForm';
import { fetchEntryForEdit, resubmitEntry } from '../lib/entryApi';
import { formatMonth, todayJst } from '../lib/schedule';

/** 基本フォームの上に置く欄（点検日・端末・対象月・掲示備考） */
interface InspectionFields {
  targetMonth: string;
  terminalId: string;
  startDate: string;
  endDate: string;
  remarks: string;
}

interface ResubmitFormProps {
  resubmit: PortalEntryRow;
  /** 点検一覧の行の対象月（無ければ対象月を選ばせる） */
  targetMonth: string | null;
  ctx: ApplyContext;
  master: MasterData;
  settings: AppSettings;
  /** 端末の選択肢（2台以上なら選ばせる） */
  terminals: string[];
  userId: string | null;
  onClose: () => void;
  onApplied: () => void;
  onDirty: () => void;
}

/** 差戻しの申請から、基本フォームの値と上の欄の値を作る（表示期間が点検日から決まる既定なら空に戻す＝一括入力の修正と同じ。editRowInput） */
function initialValues(
  entry: DbEntry,
  fallbackMonth: string,
  displayDefault: number,
  today: string,
): { fields: InspectionFields; form: BasicFormValues } {
  const row = editRowInput(entry);
  // 表示開始日がもう過ぎている（前に申請した日など）なら既定（再申請した日）に戻す（修正依頼1027(3): 既定は今日）
  if (row.displayStartDate && row.displayStartDate < today) row.displayStartDate = '';
  return {
    fields: {
      targetMonth: entry.target_month ?? fallbackMonth,
      terminalId: row.terminalId ?? '',
      startDate: row.startDate ?? '',
      endDate: row.endDate ?? '',
      remarks: row.remarks ?? '',
    },
    form: {
      noticeText: row.noticeText ?? '',
      contact: row.emergencyContact ?? '',
      posterType: row.posterType === 'custom' ? 'custom' : 'template',
      posterImage: row.posterImage ?? '',
      extraPosters: row.extraPosters ?? [],
      displayStartDate: row.displayStartDate ?? '',
      displayStartTime: row.displayStartTime ?? '',
      displayEndDate: row.displayEndDate ?? '',
      displayEndTime: row.displayEndTime ?? '',
      displayTime: String(entry.display_duration ?? displayDefault),
      position: normalizePosition(entry.poster_position),
      memo: row.memo ?? '',
      inspectionType: entry.inspection_type ?? '',
    },
  };
}

/**
 * 基本フォームで変えた欄（点検日・案内文・掲示備考・表示期間の日付以外）を列にする。触っていない列は書かない（元の申請のまま）
 */
export function resubmitFormPatch(initial: BasicFormValues, v: BasicFormValues, displayDefault: number): Partial<DbEntry> {
  const patch: Partial<DbEntry> = {};
  if (v.contact !== initial.contact) patch.emergency_contact = v.contact.trim();
  if (v.posterType !== initial.posterType || v.posterImage !== initial.posterImage) {
    patch.poster_type = v.posterType;
    patch.poster_image = v.posterType === 'custom' ? v.posterImage || null : null;
  }
  if (JSON.stringify(v.extraPosters) !== JSON.stringify(initial.extraPosters)) patch.extra_posters = v.extraPosters;
  if (v.displayStartTime !== initial.displayStartTime) patch.display_start_time = v.displayStartTime || null;
  if (v.displayEndTime !== initial.displayEndTime) patch.display_end_time = v.displayEndTime || null;
  if (v.displayTime !== initial.displayTime) patch.display_duration = parseInt(v.displayTime) || displayDefault;
  if (v.position !== initial.position) patch.poster_position = v.position;
  if (v.memo !== initial.memo) patch.memo = v.memo.trim() ? v.memo : null;
  return patch;
}

/**
 * 差戻しの修正・再申請（修正依頼1027(3) 決定③）。上に点検日・掲示備考、下は一括入力の詳細設定と同じ基本フォーム。
 * 点検開始日を入れると点検終了日も合わせる（一括入力と同じ followEndDate）。表示開始日の既定は再申請した日、表示終了日の既定は点検終了日。
 * 書き込みは今までどおり resubmitEntry（差戻し＝pending の行を直して申請済み＝draft へ戻す）
 */
export function ResubmitForm({
  resubmit,
  targetMonth,
  ctx,
  master,
  settings,
  terminals,
  userId,
  onClose,
  onApplied,
  onDirty,
}: ResubmitFormProps) {
  const { addToast } = useToast();
  const today = todayJst();
  const defaultMonth = targetMonth ?? today.slice(0, 7) + '-01';
  const displayDefault = Number(settings.display_time_default) || 6;
  const [loaded, setLoaded] = useState<{ entry: DbEntry; fields: InspectionFields; form: BasicFormValues } | null>(null);
  const [fields, setFields] = useState<InspectionFields | null>(null);
  const [form, setForm] = useState<BasicFormValues | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetchEntryForEdit(resubmit.id)
      .then((entry) => {
        if (cancelled) return;
        const init = initialValues(entry, defaultMonth, displayDefault, today);
        setLoaded({ entry, ...init });
        setFields(init.fields);
        setForm(init.form);
      })
      .catch((err: unknown) => {
        if (!cancelled) addToast(`申請を読み込めませんでした: ${err instanceof Error ? err.message : ''}`, 'error');
      });
    return () => {
      cancelled = true;
    };
  }, [resubmit.id, defaultMonth, displayDefault, today, addToast]);

  const { uploading, uploadFile, keep } = usePosterUploads({
    userId,
    // 申請が持っていた画像は消さない。消すのは開いている間にアップロードして使わなかった分だけ
    originals: [],
    discard: (urls) => {
      if (urls.length > 0) void discardOwnPosterImages(urls, userId);
    },
  });

  const entry = loaded?.entry ?? null;
  const templateNo = entry?.template_no || ctx.inspection.template_no || ctx.inspectionType?.template_no || '';
  const template = useMemo(
    () => ({
      templateNo,
      templateUrl: resolveTemplateImageUrl(templateNo, master.templateImages, templateFileUrl),
      templateName: templateDisplayName(templateNo, form?.inspectionType ?? '', master.templateImages),
    }),
    [templateNo, master.templateImages, form?.inspectionType],
  );

  if (!loaded || !fields || !form || !entry) {
    return (
      <div className="flex justify-center py-6">
        <Spinner />
      </div>
    );
  }

  const updateFields = (patch: Partial<InspectionFields>) => {
    setFields({ ...fields, ...patch });
    onDirty();
  };
  const updateForm = (patch: Partial<BasicFormValues>) => {
    setForm((prev) => (prev ? { ...prev, ...patch } : prev));
    onDirty();
  };

  const remarks = remarksUsage(fields.remarks, settings);
  const remarksWarning = remarksNotice(fields.remarks, settings.remarks_chars_per_line, settings.remarks_max_lines);
  const vendorName = entry.vendor_name ?? ctx.vendor?.vendor_name ?? '';

  const handleSubmit = async () => {
    if (submitting) return;
    if (!userId) {
      addToast('ログインが必要です', 'error');
      return;
    }
    const isCustom = form.posterType === 'custom';
    if (isCustom && !form.posterImage) {
      addToast('追加の貼紙画像を選択してください', 'error');
      return;
    }
    // 表示期間は一括入力の申請と同じ規則（表示開始日が空なら再申請した日、表示終了日が空なら点検終了日）
    const period = submittedDisplayPeriod(
      { ...form, startDate: fields.startDate, endDate: fields.endDate || fields.startDate },
      today,
    );
    const result = buildApplyRow(
      {
        targetMonth: fields.targetMonth,
        terminalId: fields.terminalId,
        startDate: fields.startDate,
        endDate: fields.endDate,
        noticeText: form.noticeText,
        remarks: fields.remarks,
        displayStartDate: period.startDate || today,
        displayEndDate: period.endDate || '',
      },
      // 追加貼紙はテンプレート画像を使わないので、テンプレート画像の有無では止めない
      isCustom ? { ...ctx, hasTemplateImage: () => true } : ctx,
      userId,
      today,
    );
    if (!result.ok) {
      addToast(result.message, 'error');
      return;
    }
    // 点検日・案内文・掲示備考・表示期間の日付・状態（と出している端末・対象月）は今までどおり。基本フォームで変えた欄だけを足す
    const patch: ResubmitPatch & Partial<DbEntry> = {
      ...toResubmitPatch(result.row, { terminal: terminals.length > 1, targetMonth: !targetMonth }),
      ...resubmitFormPatch(loaded.form, form, displayDefault),
    };
    setSubmitting(true);
    try {
      await resubmitEntry(resubmit.id, patch);
      keep([isCustom ? form.posterImage : '', ...form.extraPosters.map((x) => x.image_url)]);
      addToast('再申請しました', 'success');
      onApplied();
      onClose();
    } catch (err) {
      console.error('Resubmit failed:', err);
      addToast(`申請に失敗しました: ${err && typeof err === 'object' && 'message' in err ? String(err.message) : ''}`, 'error');
      setSubmitting(false);
    }
  };

  const header = (
    <div className="space-y-1.5 text-sm">
      <dl className="grid grid-cols-[auto_minmax(0,1fr)_auto_minmax(0,1fr)] gap-x-2 gap-y-0.5 rounded border border-gray-200 bg-gray-50 px-2 py-1 text-xs">
        <dt className="text-gray-500">物件</dt>
        <dd className="truncate">
          {ctx.inspection.property_name} <span className="text-gray-500">{ctx.inspection.property_code}</span>
        </dd>
        <dt className="text-gray-500">保守会社</dt>
        <dd className="truncate">{vendorName || <span className="text-red-600">未設定</span>}</dd>
        {targetMonth && (
          <>
            <dt className="text-gray-500">対象月</dt>
            <dd>{formatMonth(targetMonth)}</dd>
          </>
        )}
      </dl>
      {resubmit.review_comment && (
        <div role="note" className="rounded border border-red-200 bg-red-50 px-2 py-1 text-xs text-red-800">
          <span className="font-medium">差戻し理由: </span>
          <span className="whitespace-pre-line">{resubmit.review_comment}</span>
        </div>
      )}
      <div className="grid max-w-2xl grid-cols-2 gap-2 sm:grid-cols-4">
        {!targetMonth && (
          <Input
            label="対象月 *"
            type="month"
            value={fields.targetMonth.slice(0, 7)}
            onChange={(e) => updateFields({ targetMonth: e.target.value ? `${e.target.value}-01` : '' })}
          />
        )}
        <Input
          label="点検開始日 *"
          type="date"
          data-autofocus
          value={fields.startDate}
          // 一括入力と同じ連動（終了日が空・開始日と同じ・新しい開始日より前なら、終了日も新しい開始日にする）
          onChange={(e) =>
            updateFields({ startDate: e.target.value, endDate: followEndDate(fields.startDate, fields.endDate, e.target.value) })
          }
        />
        <Input label="点検終了日" type="date" value={fields.endDate} onChange={(e) => updateFields({ endDate: e.target.value })} />
        {terminals.length > 1 && (
          <Select
            label="端末"
            value={fields.terminalId}
            options={terminals.map((t) => ({ value: t, label: t }))}
            onChange={(e) => updateFields({ terminalId: e.target.value })}
          />
        )}
      </div>
      {startOutsideTargetMonth(fields) && (
        <p className="text-xs text-amber-700">点検開始日が対象月（{formatMonth(fields.targetMonth)}）の外です。このままでも申請できます。</p>
      )}
      {terminals.length === 1 && <p className="text-xs text-gray-500">端末: {terminals[0]}</p>}
      {terminals.length === 0 && (
        <p className="text-xs text-gray-500">端末が無い物件です。端末を指定せずに申請できます。</p>
      )}
      <div className="max-w-md">
        <TextArea
          label="掲示備考（作業時間など）"
          rows={2}
          placeholder={REMARKS_PLACEHOLDER}
          value={fields.remarks}
          onChange={(e) => updateFields({ remarks: e.target.value })}
        />
        <div className="flex items-start justify-between gap-2 text-xs">
          <span className="text-amber-700" data-testid="remarks-warning">
            {remarksWarning}
          </span>
          <span className={remarks.over ? 'shrink-0 font-medium text-amber-700' : 'shrink-0 text-gray-400'}>
            {remarks.lines}/{remarks.maxLines}行・1行最長 {remarks.longest}/{remarks.perLine}字
          </span>
        </div>
      </div>
    </div>
  );

  return (
    <BasicEntryForm
      values={form}
      onChange={updateForm}
      startDate={fields.startDate}
      endDate={fields.endDate || fields.startDate}
      remarks={fields.remarks}
      vendorName={vendorName}
      vendorContact={ctx.vendor?.emergency_contact ?? ''}
      propertyCode={ctx.inspection.property_code}
      template={template}
      displayTimeMax={Number(settings.display_time_max) || 30}
      displayTimeDefault={displayDefault}
      today={today}
      uploading={uploading}
      uploadFile={uploadFile}
      status={<Badge variant="warning">申請差戻し</Badge>}
      inspectionType={{}}
      showMemo
      header={header}
      footer={
        <div className="flex justify-end gap-2 border-t border-gray-200 pt-2">
          <Button variant="secondary" size="sm" onClick={onClose} disabled={submitting}>
            キャンセル
          </Button>
          <Button size="sm" onClick={() => void handleSubmit()} disabled={submitting || uploading}>
            {submitting ? '送信中…' : '再申請する'}
          </Button>
        </div>
      }
    />
  );
}

