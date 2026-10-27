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
import { BasicEntryForm, normalizePosition, type BasicFormValues } from '../components/BasicEntryForm';
import { usePosterUploads } from '../hooks/usePosterUploads';
import type { BulkEntryRow, BulkMasterData } from '../types';

interface RowDetailModalProps {
  open: boolean;
  onClose: () => void;
  rowId: number | null;
}

/**
 * 行の詳細設定（案内文・連絡先・貼紙・表示期間・表示時間・貼紙表示位置）。修正依頼1024 B18 で作り直し。
 * 開いたとき、案内文が空なら点検種別の定型文、連絡先が空なら保守会社マスターの緊急連絡先を入れておく。
 * 表示期間は既定と違う値が入っているときだけ開いておく（日付は書き換えたときだけ行に入る）。
 * 中身は基本フォーム（BasicEntryForm。承認待ちの編集・差戻しの再申請と共通。修正依頼1027(3)）。
 * v1: js/bulk-modals.js openRowDetailModal / applyRowDetail
 */
export function RowDetailModal({ open, onClose, rowId }: RowDetailModalProps) {
  const rows = useBulkStore((s) => s.rows);
  const masterData = useBulkStore((s) => s.masterData);
  const row = rows.find((r) => r.id === rowId);

  return (
    <Modal open={open} onClose={onClose} title={row ? `詳細設定（${rowTitle(row, masterData)}）` : '詳細設定'} className="max-w-4xl">
      {open && row && <RowDetailForm key={row.id} row={row} masterData={masterData} onClose={onClose} />}
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

function RowDetailForm({ row, masterData, onClose }: { row: BulkEntryRow; masterData: BulkMasterData; onClose: () => void }) {
  const { addToast } = useToast();
  const applyRowDetail = useBulkStore((s) => s.applyRowDetail);
  const currentVendor = useBulkStore((s) => s.currentVendor);
  const userId = useBulkStore((s) => s.userId);
  const displayTimeMax = Number(useBulkStore((s) => s.appSettings.display_time_max) || 30);
  const displayTimeDefault = Number(useBulkStore((s) => s.appSettings.display_time_default) || 6);

  const notice = row.inspectionType ? masterData.notices.find((n) => n.inspectionType === row.inspectionType) : undefined;
  const vendorContact = masterData.vendors.find((v) => v.vendorName === currentVendor.name)?.emergencyContact ?? '';
  const templateImages = masterData.templateImages ?? [];
  const templateNo = notice?.templateNo ?? '';

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
    keep([isCustom ? values.posterImage : '', ...values.extraPosters.map((x) => x.image_url)]);
    applyRowDetail(row.id, {
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
    });
    onClose();
    addToast('詳細設定を保存しました', 'success');
  };

  return (
    <BasicEntryForm
      values={values}
      onChange={(patch) => setValues((v) => ({ ...v, ...patch }))}
      startDate={row.startDate}
      endDate={row.endDate}
      remarks={row.remarks}
      vendorName={currentVendor.name ?? ''}
      vendorContact={vendorContact}
      propertyCode={row.propertyCode}
      template={{
        templateNo,
        templateUrl: resolveTemplateImageUrl(templateNo, templateImages, templateFileUrl),
        templateName: templateDisplayName(templateNo, row.inspectionType, templateImages),
      }}
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
