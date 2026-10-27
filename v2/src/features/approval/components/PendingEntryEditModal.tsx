import { useMemo, useState } from 'react';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { useToast } from '@/components/ui/Toast';
import { entryErrorReason, updatePendingEntry } from '@/lib/api/admin-entries';
import { discardOwnPosterImages } from '@/lib/storage';
import { normalizeTerminalId } from '@/lib/terminal';
import { templateFileUrl } from '@/lib/templateStorage';
import { parseExtraPosters } from '@/lib/extraPosters';
import { resolveTemplateImageUrl } from '@/features/single-entry/lib/templateImages';
import {
  displayPeriodWarning,
  entryApprovalLabel,
  formatJaDate,
  formatJaDateTime,
  localDateString,
} from '@/features/entries-list/lib/entries';
import { applyDefaultStartDate } from '@/features/entries-list/hooks/useEntriesFilters';
import { BasicEntryForm, normalizePosition, type BasicFormValues } from '@/features/bulk-entry/components/BasicEntryForm';
import { usePosterUploads } from '@/features/bulk-entry/hooks/usePosterUploads';
import { templateDisplayName } from '@/features/bulk-entry/utils/rowDetail';
import type { DbEntry, DbInspectionType, DbTemplateImage, DbVendor } from '@/types/database';

interface PendingEntryEditModalProps {
  entry: DbEntry | null;
  onClose: () => void;
  /** 保存後に一覧を読み直す */
  onSaved: () => void | Promise<void>;
  userId: string | null;
  propertyNames: Map<string, string>;
  emailOf: (userId: string | null | undefined) => string;
  inspectionTypes: DbInspectionType[];
  templateImages: Pick<DbTemplateImage, 'image_key' | 'image_url' | 'display_name'>[];
  vendors: Pick<DbVendor, 'vendor_name' | 'emergency_contact'>[];
  displayDefault: number;
  /** 承認できない理由（建物未承認など）。あれば「保存して承認」を押せない */
  approveBlockedReason?: string;
}

/** 表示時間（秒）の上限（旧「表示設定を編集」と同じ） */
const DISPLAY_TIME_MAX = 60;

/**
 * 承認待ち（申請済み）の申請を管理者が直す。一括入力の詳細設定と同じ基本フォームに、ステータス・テンプレートNo・メモ・点検種別
 * （選び直せる。テンプレートNoも追従）・登録者と登録日時を足したもの（修正依頼1027(3) 決定③。旧「申請内容の詳細」「表示設定を編集」の代わり）。
 * 「保存」は承認待ちのまま、「保存して承認」は同じ更新で承認済みにする。どちらも開いたときの版（updated_at）の申請だけを直す
 */
export function PendingEntryEditModal(props: PendingEntryEditModalProps) {
  if (!props.entry) return null;
  // 開くたびに初期値を作り直す
  return <PendingEntryEditDialog key={props.entry.id} {...props} entry={props.entry} />;
}

/** 申請の行からフォームの値を作る */
export function pendingFormValues(entry: DbEntry, displayDefault: number): BasicFormValues {
  return {
    noticeText: entry.announcement ?? '',
    contact: entry.emergency_contact ?? '',
    posterType: entry.poster_type === 'custom' ? 'custom' : 'template',
    posterImage: entry.poster_image ?? '',
    extraPosters: parseExtraPosters(entry.extra_posters),
    displayStartDate: entry.display_start_date ?? '',
    displayStartTime: entry.display_start_time ?? '',
    displayEndDate: entry.display_end_date ?? '',
    displayEndTime: entry.display_end_time ?? '',
    displayTime: String(entry.display_duration ?? displayDefault),
    position: normalizePosition(entry.poster_position),
    memo: entry.memo ?? '',
    inspectionType: entry.inspection_type ?? '',
  };
}

/**
 * 変えた欄だけを列にする（触っていない列は書かない＝今の値のまま）。日付を空にした欄はフォームに見えている既定の日付
 * （表示開始日は今日、表示終了日は点検終了日）を入れる
 */
export function pendingEntryPatch(
  initial: BasicFormValues,
  v: BasicFormValues,
  entry: DbEntry,
  opts: { templateNo: string; today: string; displayDefault: number },
): Partial<DbEntry> {
  const patch: Partial<DbEntry> = {};
  if (v.noticeText !== initial.noticeText) patch.announcement = v.noticeText;
  if (v.contact !== initial.contact) patch.emergency_contact = v.contact.trim();
  if (v.posterType !== initial.posterType || v.posterImage !== initial.posterImage) {
    patch.poster_type = v.posterType;
    patch.poster_image = v.posterType === 'custom' ? v.posterImage || null : null;
  }
  if (JSON.stringify(v.extraPosters) !== JSON.stringify(initial.extraPosters)) patch.extra_posters = v.extraPosters;
  if (v.displayStartDate !== initial.displayStartDate) patch.display_start_date = v.displayStartDate || opts.today;
  if (v.displayStartTime !== initial.displayStartTime) patch.display_start_time = v.displayStartTime || null;
  if (v.displayEndDate !== initial.displayEndDate) {
    patch.display_end_date = v.displayEndDate || entry.inspection_end || entry.inspection_start || null;
  }
  if (v.displayEndTime !== initial.displayEndTime) patch.display_end_time = v.displayEndTime || null;
  if (v.displayTime !== initial.displayTime) patch.display_duration = parseInt(v.displayTime) || opts.displayDefault;
  if (v.position !== initial.position) patch.poster_position = v.position;
  if (v.memo !== initial.memo) patch.memo = v.memo.trim() ? v.memo : null;
  if (v.inspectionType !== initial.inspectionType) {
    patch.inspection_type = v.inspectionType;
    patch.template_no = opts.templateNo;
  }
  return patch;
}

function PendingEntryEditDialog({
  entry,
  onClose,
  onSaved,
  userId,
  propertyNames,
  emailOf,
  inspectionTypes,
  templateImages,
  vendors,
  displayDefault,
  approveBlockedReason,
}: PendingEntryEditModalProps & { entry: DbEntry }) {
  const { addToast } = useToast();
  const [initial] = useState(() => pendingFormValues(entry, displayDefault));
  const [values, setValues] = useState(initial);
  const [saving, setSaving] = useState<null | 'save' | 'approve'>(null);
  const dirty = JSON.stringify(values) !== JSON.stringify(initial);

  const typeOf = (name: string) => inspectionTypes.find((t) => t.inspection_name === name);
  // テンプレートNo: 点検種別を変えていなければ申請の値、変えたら点検種別マスターの対応（一括入力の申請と同じ）
  const templateNo =
    values.inspectionType === initial.inspectionType
      ? (entry.template_no ?? typeOf(values.inspectionType)?.template_no ?? '')
      : (typeOf(values.inspectionType)?.template_no ?? '');
  const vendorContact = vendors.find((v) => v.vendor_name === entry.vendor_name)?.emergency_contact ?? '';
  const typeOptions = useMemo(() => inspectionTypes.map((t) => t.inspection_name).filter(Boolean), [inspectionTypes]);

  const { uploading, uploadFile, keep } = usePosterUploads({
    userId,
    // 申請が持っていた画像は消さない（ほかの申請・未使用画像の整理に任せる）。消すのは開いている間にアップロードして使わなかった分だけ
    originals: [],
    discard: (urls) => {
      if (urls.length > 0) void discardOwnPosterImages(urls, userId);
    },
  });

  const handleChange = (patch: Partial<BasicFormValues>) =>
    setValues((prev) => {
      const next = { ...prev, ...patch };
      // 点検種別を変えたとき、案内文が前の点検種別の既定文のまま（か空）なら新しい既定文にする
      if (patch.inspectionType !== undefined && patch.inspectionType !== prev.inspectionType) {
        const before = typeOf(prev.inspectionType)?.default_text ?? '';
        if (!prev.noticeText || prev.noticeText === before) next.noticeText = typeOf(patch.inspectionType)?.default_text ?? '';
      }
      return next;
    });

  const save = async (approve: boolean) => {
    if (saving) return;
    if (values.posterType === 'custom' && !values.posterImage) {
      addToast('追加の貼紙画像を選択してください', 'error');
      return;
    }
    const seconds = parseInt(values.displayTime);
    if (!(seconds >= 1 && seconds <= DISPLAY_TIME_MAX)) {
      addToast(`表示時間は1〜${DISPLAY_TIME_MAX}秒で入力してください`, 'error');
      return;
    }
    const today = localDateString();
    const patch = pendingEntryPatch(initial, values, entry, { templateNo, today, displayDefault });
    const start = patch.display_start_date ?? entry.display_start_date;
    const end = patch.display_end_date ?? entry.display_end_date;
    if (start && end && end < start) {
      addToast('表示終了日は表示開始日以降にしてください', 'error');
      return;
    }
    if (!approve && Object.keys(patch).length === 0) {
      addToast('変更はありません', 'info');
      onClose();
      return;
    }
    setSaving(approve ? 'approve' : 'save');
    try {
      await updatePendingEntry(entry.id, approve ? { ...patch, status: 'ready' } : patch, entry.updated_at ?? null);
      keep([values.posterType === 'custom' ? values.posterImage : '', ...values.extraPosters.map((x) => x.image_url)]);
      addToast(approve ? '保存して承認しました' : '保存しました', 'success');
      if (approve) applyDefaultStartDate();
      onClose();
      await onSaved();
    } catch (error) {
      console.error('Failed to update entry:', error);
      addToast(`${approve ? '保存・承認' : '保存'}に失敗しました: ${entryErrorReason(error)}`, 'error');
      setSaving(null);
    }
  };

  const propertyName = propertyNames.get(entry.property_code) || '';
  const warning = displayPeriodWarning(entry);
  const busy = saving !== null || uploading;

  return (
    <Modal
      open
      onClose={onClose}
      title={`申請の編集（${[propertyName || entry.property_code, values.inspectionType].filter(Boolean).join(' ')}）`}
      className="max-w-4xl"
      dirty={dirty}
      busy={saving !== null}
    >
      <BasicEntryForm
        values={values}
        onChange={handleChange}
        startDate={entry.inspection_start ?? ''}
        endDate={entry.inspection_end ?? ''}
        remarks={entry.remarks ?? ''}
        vendorName={entry.vendor_name ?? ''}
        vendorContact={vendorContact}
        propertyCode={entry.property_code}
        template={{
          templateNo,
          templateUrl: resolveTemplateImageUrl(templateNo, templateImages, templateFileUrl),
          templateName: templateDisplayName(templateNo, values.inspectionType, templateImages),
        }}
        displayTimeMax={DISPLAY_TIME_MAX}
        displayTimeDefault={displayDefault}
        today={localDateString()}
        uploading={uploading}
        uploadFile={uploadFile}
        status={<Badge variant="warning">{entryApprovalLabel(entry.status)}</Badge>}
        inspectionType={{
          options: typeOptions,
          note: entry.property_inspection_id ? '点検予定に紐付いた申請です。点検種別を変えても紐付けは変わりません' : undefined,
        }}
        registrant={{ email: emailOf(entry.user_id), at: formatJaDateTime(entry.created_at) }}
        showMemo
        // 申請済みの行は表示期間に日付が入っている（申請日など）ので畳んでおき、注意があるときだけ開く。位置は既定と違うときだけ開く
        initiallyOpen={{ period: !!warning, layout: initial.position !== '2' }}
        header={
          <dl className="grid grid-cols-[auto_minmax(0,1fr)_auto_minmax(0,1fr)] gap-x-2 gap-y-0.5 rounded border border-gray-200 bg-gray-50 px-2 py-1 text-xs">
            <dt className="text-gray-500">物件</dt>
            <dd className="truncate">
              {entry.property_code} {propertyName}
            </dd>
            <dt className="text-gray-500">端末</dt>
            <dd className="truncate">{normalizeTerminalId(entry.terminal_id) || '-'}</dd>
            <dt className="text-gray-500">保守会社</dt>
            <dd className="truncate">{entry.vendor_name || '-'}</dd>
            <dt className="text-gray-500">点検期間</dt>
            <dd>
              {formatJaDate(entry.inspection_start)}〜{formatJaDate(entry.inspection_end)}
            </dd>
            <dt className="text-gray-500">掲示備考</dt>
            <dd className="col-span-3 whitespace-pre-line">{entry.remarks || '-'}</dd>
            {warning && (
              <dd className="col-span-4 font-medium text-red-600" data-testid="period-warning">
                表示期間: {formatJaDate(entry.display_start_date)}〜{formatJaDate(entry.display_end_date)}（{warning}）
              </dd>
            )}
          </dl>
        }
        footer={
          <div className="flex flex-wrap items-center justify-end gap-2 border-t border-gray-200 pt-2">
            <Button variant="secondary" type="button" onClick={onClose} disabled={saving !== null}>
              キャンセル
            </Button>
            <Button variant="primary" type="button" onClick={() => void save(false)} disabled={busy}>
              {saving === 'save' ? '保存中...' : '保存'}
            </Button>
            <Button
              variant="success"
              type="button"
              onClick={() => void save(true)}
              disabled={busy || !!approveBlockedReason}
              title={approveBlockedReason}
            >
              {saving === 'approve' ? '承認中...' : '保存して承認'}
            </Button>
          </div>
        }
      />
    </Modal>
  );
}
