import { useState } from 'react';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { useToast } from '@/components/ui/Toast';
import { useBulkStore } from '@/stores/bulkStore';
import { todayUtc } from '@/lib/utils';
import { templateFileUrl } from '@/lib/templateStorage';
import { resolveTemplateImageUrl } from '@/features/single-entry/lib/templateImages';
import { formatMonth } from '@/features/inspection-portal/lib/schedule';
import { discardUnheldRowImages } from '../utils/discardRowImages';
import { templateDisplayName } from '../utils/rowDetail';
import { StatusBadge } from '@/features/inspection-portal/components/StatusBadge';
import type { InspectionStatus } from '@/features/inspection-portal/lib/status';
import { BasicEntryForm, normalizePosition, type BasicFormValues } from '../components/BasicEntryForm';
import { usePosterUploads } from '../hooks/usePosterUploads';
import { retypeTarget, vendorTypeOptions, type ScopeInspection } from '../utils/typeScope';
import type { BulkEntryRow, BulkMasterData } from '../types';

/** 行の詳細設定に足して出すもの（修正依頼1029。画面側が予定・申請から決める） */
export interface RowDetailContext {
  /** 行のステータス（点検予定の行）。手入力の行は無し（「未申請」と出す） */
  status?: InspectionStatus;
  /** 登録者・登録日時（申請済みの申請を修正している行だけ） */
  registrant?: { email: string; at: string };
  /** 選択中の保守会社が担当する点検行（選べる点検種別と、予定の行の移し先を決める） */
  inspections: readonly ScopeInspection[];
}

interface RowDetailModalProps {
  open: boolean;
  onClose: () => void;
  rowId: number | null;
  context?: RowDetailContext;
}

/**
 * 行の詳細設定（案内文・連絡先・貼紙・表示期間・表示時間・貼紙表示位置）。修正依頼1024 B18 で作り直し。
 * 開いたとき、案内文が空なら点検種別の定型文、連絡先が空なら保守会社マスターの緊急連絡先を入れておく。
 * 表示期間は既定と違う値が入っているときだけ開いておく（日付は書き換えたときだけ行に入る）。
 * 中身は基本フォーム（BasicEntryForm。承認待ちの編集・差戻しの再申請と共通。修正依頼1027(3)）。
 * v1: js/bulk-modals.js openRowDetailModal / applyRowDetail
 */
export function RowDetailModal({ open, onClose, rowId, context }: RowDetailModalProps) {
  const rows = useBulkStore((s) => s.rows);
  const masterData = useBulkStore((s) => s.masterData);
  const row = rows.find((r) => r.id === rowId);

  return (
    <Modal open={open} onClose={onClose} title={row ? `詳細設定（${rowTitle(row, masterData)}）` : '詳細設定'} className="max-w-4xl">
      {open && row && <RowDetailForm key={row.id} row={row} masterData={masterData} onClose={onClose} context={context} />}
    </Modal>
  );
}

/**
 * タイトルに出す行の名前（物件名・点検種別・対象月）。ストアの並びと表の No は予定行の並べ替えで一致しないので、
 * 番号ではなく表で見える値で示す
 */
function rowTitle(row: BulkEntryRow, masterData: BulkMasterData): string {
  const propertyName =
    row.schedule?.propertyName ||
    masterData.properties.find((p) => String(p.propertyCode) === String(row.propertyCode))?.propertyName ||
    row.propertyCode ||
    '物件未選択';
  const month = row.schedule?.targetMonth ? formatMonth(row.schedule.targetMonth) : '';
  return [propertyName, row.inspectionType, month].filter(Boolean).join(' ');
}

function RowDetailForm({
  row,
  masterData,
  onClose,
  context,
}: {
  row: BulkEntryRow;
  masterData: BulkMasterData;
  onClose: () => void;
  context?: RowDetailContext;
}) {
  const { addToast } = useToast();
  const applyRowDetail = useBulkStore((s) => s.applyRowDetail);
  const moveScheduleInput = useBulkStore((s) => s.moveScheduleInput);
  const currentVendor = useBulkStore((s) => s.currentVendor);
  const userId = useBulkStore((s) => s.userId);
  const displayTimeMax = Number(useBulkStore((s) => s.appSettings.display_time_max) || 30);
  const displayTimeDefault = Number(useBulkStore((s) => s.appSettings.display_time_default) || 6);

  const noticeOf = (type: string) => (type ? masterData.notices.find((n) => n.inspectionType === type) : undefined);
  const notice = noticeOf(row.inspectionType);
  const vendorContact = masterData.vendors.find((v) => v.vendorName === currentVendor.name)?.emergencyContact ?? '';
  const templateImages = masterData.templateImages ?? [];

  const [values, setValues] = useState<BasicFormValues>(() => ({
    noticeText: row.noticeText || notice?.noticeText || '',
    contact: row.emergencyContact || vendorContact,
    posterType: row.posterType === 'custom' ? 'custom' : 'template',
    posterImage: row.posterImage || '',
    // 2枚目以降の貼紙（修正依頼1025 D3）。選んだ時点でアップロードして URL を持つ（1枚目と同じ）
    extraPosters: row.extraPosters ?? [],
    displayStartDate: row.displayStartDate || '',
    displayStartTime: row.displayStartTime || '',
    displayEndDate: row.displayEndDate || '',
    displayEndTime: row.displayEndTime || '',
    // v1 は window.appSettings（一括入力では未設定）を見るので、行に値が無いときの既定は 6
    displayTime: String(row.displayTime || 6),
    position: normalizePosition(row.position),
    memo: row.memo,
    inspectionType: row.inspectionType,
  }));
  const isCustom = values.posterType === 'custom';
  // テンプレートNo・テンプレート名・プレビューは選んでいる点検種別で決まる（変えたら追従する。修正依頼1027(3)・1029）
  const templateNo = noticeOf(values.inspectionType)?.templateNo ?? '';
  const typeChanged = values.inspectionType !== row.inspectionType;

  // 選べる点検種別: その物件で自社が担当する点検種別だけ（ユーザー決定④）。申請済みの申請を修正している行は変えられない
  // （申請の点検・種別の付け替えは修正の対象外。取り下げて申請し直す）
  const options = vendorTypeOptions(
    context?.inspections ?? [],
    row.propertyCode,
    null,
    masterData.notices.map((n) => n.inspectionType),
  );
  const editing = !!row.schedule?.editEntryId;
  const typeNote = editing
    ? '申請済みの申請を修正中のため、点検種別は変えられません'
    : options.length === 0
      ? 'この物件に自社が担当する点検（業務システム）が無いため、点検種別はここでは変えられません'
      : row.schedule && typeChanged
        ? `保存すると「${values.inspectionType}」の点検の行へ移します（紐付ける点検も変わります）`
        : undefined;

  const changeValues = (patch: Partial<BasicFormValues>) =>
    setValues((prev) => {
      const next = { ...prev, ...patch };
      // 点検種別を変えたとき、案内文が前の点検種別の既定文のまま（か空）なら新しい既定文にする（管理者の編集と同じ）
      if (patch.inspectionType !== undefined && patch.inspectionType !== prev.inspectionType) {
        const before = noticeOf(prev.inspectionType)?.noticeText ?? '';
        if (!prev.noticeText || prev.noticeText === before) next.noticeText = noticeOf(patch.inspectionType)?.noticeText ?? '';
      }
      return next;
    });

  // 開いている間にアップロードした画像と、保存したときに行に残す画像。閉じたとき（保存・キャンセル・×・Escape）に、
  // 行に残らない画像を片付ける（画面のほかの行・テンプレートがまだ持つ画像は残す）
  const { uploading, uploadFile, keep } = usePosterUploads({
    userId,
    originals: [row.posterImage || '', ...(row.extraPosters ?? []).map((x) => x.image_url)],
    discard: discardUnheldRowImages,
  });

  const handleApply = () => {
    if (isCustom && !values.posterImage) {
      addToast('追加の貼紙画像を選択してください', 'error');
      return;
    }
    if (typeChanged && !templateNo) {
      addToast(`点検種別「${values.inspectionType}」にテンプレートNoがありません。別の点検種別を選んでください`, 'error');
      return;
    }
    const detail = {
      noticeText: values.noticeText,
      // 保守会社マスターと同じなら持たない（マスターの変更に追従させる）
      emergencyContact: values.contact.trim() === vendorContact ? '' : values.contact.trim(),
      posterType: values.posterType,
      posterImage: isCustom ? values.posterImage : '',
      extraPosters: values.extraPosters.length > 0 ? values.extraPosters : undefined,
      // 表示期間の日付は書き換えたときだけ値が入る（空のままなら申請日・点検終了日。修正依頼1027(3)）
      displayStartDate: values.displayStartDate,
      displayStartTime: values.displayStartTime,
      displayEndDate: values.displayEndDate,
      displayEndTime: values.displayEndTime,
      displayTime: parseInt(values.displayTime) || 6,
      position: parseInt(values.position),
    };
    if (!typeChanged) {
      keep([isCustom ? values.posterImage : '', ...values.extraPosters.map((x) => x.image_url)]);
      applyRowDetail(row.id, detail);
      onClose();
      addToast('詳細設定を保存しました', 'success');
      return;
    }
    // 点検種別を変えた（修正依頼1029）。手入力の行はそのまま変える（申請のときに物件・種別・点検開始日の月で点検に結び付く）。
    // 点検予定の行は、新しい種別の点検の同じ月の予定の行へ入力を移す（無ければ手入力の行にする）
    if (!row.schedule) {
      keep([isCustom ? values.posterImage : '', ...values.extraPosters.map((x) => x.image_url)]);
      applyRowDetail(row.id, { ...detail, inspectionType: values.inspectionType });
      onClose();
      addToast('詳細設定を保存しました', 'success');
      return;
    }
    const target = retypeTarget(useBulkStore.getState().rows, row, values.inspectionType, context?.inspections ?? []);
    if (target.kind === 'error') {
      addToast(target.message, 'error');
      return;
    }
    keep([isCustom ? values.posterImage : '', ...values.extraPosters.map((x) => x.image_url)]);
    moveScheduleInput(row.id, target.kind === 'row' ? target.rowId : null, { ...detail, inspectionType: values.inspectionType });
    onClose();
    addToast(
      target.kind === 'row'
        ? `「${values.inspectionType}」の点検の行へ移しました`
        : `「${values.inspectionType}」の点検にこの月の予定が無いため、手入力の行として表の上に足しました`,
      'success',
    );
  };

  return (
    <BasicEntryForm
      values={values}
      onChange={changeValues}
      startDate={row.startDate}
      endDate={row.endDate}
      remarks={row.remarks}
      vendorName={currentVendor.name ?? ''}
      vendorContact={vendorContact}
      propertyCode={row.propertyCode}
      template={{
        templateNo,
        templateUrl: resolveTemplateImageUrl(templateNo, templateImages, templateFileUrl),
        templateName: templateDisplayName(templateNo, values.inspectionType, templateImages),
      }}
      status={<StatusBadge status={context?.status ?? 'not_applied'} />}
      inspectionType={{ options: editing || options.length === 0 ? undefined : options, note: typeNote }}
      registrant={context?.registrant}
      displayTimeMax={displayTimeMax}
      displayTimeDefault={displayTimeDefault}
      today={todayUtc()}
      uploading={uploading}
      uploadFile={uploadFile}
      footer={
        <div className="flex justify-end gap-3">
          <Button variant="secondary" onClick={onClose}>
            キャンセル
          </Button>
          <Button onClick={handleApply} disabled={uploading}>
            保存
          </Button>
        </div>
      }
    />
  );
}
