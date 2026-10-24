import { useEffect, useId, useRef, useState } from 'react';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { useToast } from '@/components/ui/Toast';
import { useBulkStore } from '@/stores/bulkStore';
import { cn, todayUtc } from '@/lib/utils';
import { POSTER_PNG_SIZE } from '@/lib/constants';
import { preparePosterImage } from '@/lib/pdfToPng';
import { uploadPosterImage } from '@/lib/storage';
import { templateFileUrl } from '@/lib/templateStorage';
import { PosterPreview } from '@/features/single-entry/components/PosterPreview';
import { resolveTemplateImageUrl } from '@/features/single-entry/lib/templateImages';
import { formatPosterDate } from '@/features/single-entry/lib/entryLogic';
import { formatMonth } from '@/features/inspection-portal/lib/schedule';
import { rowDetailDiscards } from '@/lib/posterPath';
import { discardUnheldRowImages } from '../utils/discardRowImages';
import { POSITIONS, hasCustomDisplayPeriod, submittedDisplayPeriod, templateDisplayName } from '../utils/rowDetail';
import type { BulkEntryRow, BulkMasterData } from '../types';

interface RowDetailModalProps {
  open: boolean;
  onClose: () => void;
  rowId: number | null;
}

// 幅を含まない基本の見た目。cn は結合だけなので w-full と w-24 を並べると CSS の並び順で w-full が勝つ（幅は使う側で 1 つだけ付ける）
const fieldBase =
  'block rounded-md border border-gray-300 px-2 py-1 text-sm focus:border-blue-500 focus:outline-none disabled:bg-gray-100 disabled:text-gray-500';
const field = `${fieldBase} w-full`;

/**
 * 行の詳細設定（案内文・連絡先・貼紙・表示期間・表示時間・貼紙表示位置）。修正依頼1024 B18 で作り直し。
 * 開いたとき、案内文が空なら点検種別の定型文、連絡先が空なら保守会社マスターの緊急連絡先を入れておく。
 * 表示期間は既定と違う値が入っているときだけ開いておく（畳んだまま保存したら行の値を変えない）。
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
  const uid = useId();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const notice = row.inspectionType ? masterData.notices.find((n) => n.inspectionType === row.inspectionType) : undefined;
  const vendorContact = masterData.vendors.find((v) => v.vendorName === currentVendor.name)?.emergencyContact ?? '';
  const templateImages = masterData.templateImages ?? [];
  const templateNo = notice?.templateNo ?? '';
  const templateUrl = resolveTemplateImageUrl(templateNo, templateImages, templateFileUrl);
  const templateName = templateDisplayName(templateNo, row.inspectionType, templateImages);

  const [noticeText, setNoticeText] = useState(row.noticeText || notice?.noticeText || '');
  const [contact, setContact] = useState(row.emergencyContact || vendorContact);
  const [posterType, setPosterType] = useState<'template' | 'custom'>(row.posterType === 'custom' ? 'custom' : 'template');
  const [posterImage, setPosterImage] = useState(row.posterImage || '');
  const [uploading, setUploading] = useState(false);
  // 開いている間にアップロードした画像と、保存したときに行に残す画像。閉じたとき（保存・キャンセル・×・Escape）に、
  // 行に残らない画像を片付ける（閉じ方によらずフォームが外れるときに1回だけ）
  const uploadedRef = useRef<string[]>([]);
  const keptRef = useRef<string | null>(null);
  const closedRef = useRef(false);
  const originalImage = row.posterImage || '';
  useEffect(() => {
    closedRef.current = false;
    return () => {
      closedRef.current = true;
      const discards = rowDetailDiscards({
        original: originalImage,
        uploaded: uploadedRef.current,
        kept: keptRef.current ?? originalImage,
      });
      uploadedRef.current = [];
      keptRef.current = null;
      discardUnheldRowImages(discards);
    };
  }, [originalImage]);

  // 表示期間は既定（空・点検期間のまま）なら畳む。開いたら空の欄に点検期間を入れる（旧モーダルと同じ既定）
  const [periodOpen, setPeriodOpen] = useState(() => hasCustomDisplayPeriod(row));
  const [periodShown, setPeriodShown] = useState(periodOpen);
  const [displayStartDate, setDisplayStartDate] = useState(row.displayStartDate || row.startDate || '');
  const [displayStartTime, setDisplayStartTime] = useState(row.displayStartTime || '');
  const [displayEndDate, setDisplayEndDate] = useState(row.displayEndDate || row.endDate || '');
  const [displayEndTime, setDisplayEndTime] = useState(row.displayEndTime || '');
  // v1 は window.appSettings（一括入力では未設定）を見るので、行に値が無いときの既定は 6
  const [displayTime, setDisplayTime] = useState(String(row.displayTime || 6));
  const [position, setPosition] = useState(() => {
    const v = row.position !== undefined ? String(row.position) : '2';
    return POSITIONS.some((p) => p.value === v) ? v : '2';
  });

  const isCustom = posterType === 'custom';

  const togglePeriod = () => {
    setPeriodOpen((o) => !o);
    setPeriodShown(true);
  };

  // 選んだ時点で poster-images にアップロードして URL を持つ（自動保存に File を入れないため）。PDF は1ページ目を PNG にする
  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const input = e.target;
    const file = input.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const prepared = await preparePosterImage(file);
      if (!userId) throw new Error('ログイン情報を確認できません。画面を読み込み直してください');
      const url = await uploadPosterImage(prepared.file, userId);
      // アップロード中に閉じられたら、行には入らないのでその場で片付ける
      if (closedRef.current) {
        discardUnheldRowImages([url]);
        return;
      }
      uploadedRef.current.push(url);
      setPosterImage(url);
      if (prepared.notice) addToast(prepared.notice, 'info');
    } catch (err) {
      addToast(err instanceof Error ? err.message : '画像を選択できませんでした', 'error');
    } finally {
      setUploading(false);
      input.value = '';
    }
  };

  const handleApply = () => {
    if (isCustom && !posterImage) {
      addToast('追加の貼紙画像を選択してください', 'error');
      return;
    }
    keptRef.current = isCustom ? posterImage : '';
    applyRowDetail(row.id, {
      noticeText,
      // 保守会社マスターと同じなら持たない（マスターの変更に追従させる）
      emergencyContact: contact.trim() === vendorContact ? '' : contact.trim(),
      posterType,
      posterImage: isCustom ? posterImage : '',
      // 表示期間を一度も開かなければ行の値のまま（開いただけで点検期間が入り「詳細✓」になるのを避ける）
      displayStartDate: periodShown ? displayStartDate : row.displayStartDate,
      displayStartTime: periodShown ? displayStartTime : row.displayStartTime,
      displayEndDate: periodShown ? displayEndDate : row.displayEndDate,
      displayEndTime: periodShown ? displayEndTime : row.displayEndTime,
      displayTime: parseInt(displayTime) || 6,
      position: parseInt(position),
    });
    onClose();
    addToast('詳細設定を保存しました', 'success');
  };

  // 畳んだときの要約は申請で保存される値で出す（一度も開かずに保存すると行の値のまま＝表示開始日が空なら申請日になる）
  const shownPeriod = periodShown
    ? submittedDisplayPeriod(
        { displayStartDate, displayStartTime, displayEndDate, displayEndTime, endDate: row.endDate, startDate: row.startDate },
        todayUtc(),
      )
    : submittedDisplayPeriod(row, todayUtc());
  const periodSummary = `${shownPeriod.startDate || '申請日'}${shownPeriod.startTime ? ` ${shownPeriod.startTime}` : ''} 〜 ${
    shownPeriod.endDate || '点検終了日'
  }${shownPeriod.endTime ? ` ${shownPeriod.endTime}` : ''}`;

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-1 gap-3 md:grid-cols-[minmax(0,1fr)_14rem]">
        <div className="min-w-0 space-y-2.5">
          <section className="space-y-1">
            <div className="flex flex-wrap items-baseline gap-x-2">
              <label htmlFor={`${uid}-notice`} className="text-sm font-semibold text-gray-800">
                掲示板用案内文
              </label>
              <span className="text-xs text-gray-500">デフォルトで表示される案内文（点検種別の既定文。編集できます）</span>
            </div>
            <textarea
              id={`${uid}-notice`}
              value={noticeText}
              onChange={(e) => setNoticeText(e.target.value)}
              rows={3}
              maxLength={200}
              disabled={isCustom}
              placeholder="例：エレベーター点検のため、一時的に停止いたします。"
              className={field}
            />
            <div className="flex justify-between text-xs text-gray-500">
              <span>{isCustom ? '追加の貼紙では案内文はサイネージに出ません（CSV でも空になります）' : ''}</span>
              <span>{noticeText.length}/200</span>
            </div>
          </section>

          <section className="space-y-1">
            <div className="flex flex-wrap items-baseline gap-x-2">
              <label htmlFor={`${uid}-contact`} className="text-sm font-semibold text-gray-800">
                連絡先
              </label>
              <span className="text-xs text-gray-500">
                デフォルトは保守会社に登録されている緊急連絡先{vendorContact ? `（${vendorContact}）` : ''}。編集できます
              </span>
            </div>
            <div className="flex gap-1">
              <input
                id={`${uid}-contact`}
                type="text"
                value={contact}
                maxLength={50}
                placeholder="例: 092-000-0000"
                onChange={(e) => setContact(e.target.value)}
                className={`${fieldBase} min-w-0 flex-1`}
              />
              {contact !== vendorContact && (
                <Button type="button" variant="secondary" size="sm" onClick={() => setContact(vendorContact)}>
                  既定に戻す
                </Button>
              )}
            </div>
          </section>

          <fieldset className="space-y-1">
            <legend className="text-sm font-semibold text-gray-800">貼紙</legend>
            <div className="flex gap-4 text-sm">
              <label className="inline-flex items-center gap-1">
                <input
                  type="radio"
                  name={`${uid}-poster-type`}
                  value="template"
                  checked={!isCustom}
                  onChange={() => setPosterType('template')}
                />
                テンプレート
              </label>
              <label className="inline-flex items-center gap-1">
                <input
                  type="radio"
                  name={`${uid}-poster-type`}
                  value="custom"
                  checked={isCustom}
                  onChange={() => setPosterType('custom')}
                />
                追加
              </label>
            </div>
            {isCustom && (
              <div className="space-y-1">
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".jpg,.jpeg,.png,.pdf,image/jpeg,image/png,application/pdf"
                  onChange={(e) => void handleFile(e)}
                  className="hidden"
                  aria-label="貼紙画像"
                />
                {posterImage ? (
                  <div className="flex flex-wrap items-center gap-2 text-sm">
                    <span className="text-gray-700">画像を選択済み（右に表示）</span>
                    <Button
                      type="button"
                      variant="secondary"
                      size="sm"
                      disabled={uploading}
                      onClick={() => fileInputRef.current?.click()}
                    >
                      {uploading ? '変換・アップロード中…' : '画像を変更'}
                    </Button>
                    <Button type="button" variant="danger" size="sm" disabled={uploading} onClick={() => setPosterImage('')}>
                      削除
                    </Button>
                  </div>
                ) : (
                  <button
                    type="button"
                    disabled={uploading}
                    onClick={() => fileInputRef.current?.click()}
                    className="w-full rounded-md border-2 border-dashed border-gray-300 p-3 text-center text-sm text-gray-600 hover:bg-gray-50 disabled:opacity-60"
                  >
                    {uploading ? '変換・アップロード中…' : 'クリックして画像を選択'}
                    <br />
                    <small>
                      JPG, PNG, PDF形式（5MB以下）。PDF は1ページ目を {POSTER_PNG_SIZE.width}×{POSTER_PNG_SIZE.height} の PNG に変換します
                    </small>
                  </button>
                )}
              </div>
            )}
          </fieldset>
        </div>

        <aside className="min-w-0 space-y-1" aria-label="貼紙のプレビュー">
          {isCustom ? (
            posterImage ? (
              <img
                src={posterImage}
                alt="追加の貼紙"
                className="mx-auto max-h-72 w-auto max-w-full rounded border border-gray-200 object-contain"
              />
            ) : (
              <div className="flex h-48 items-center justify-center rounded-md bg-slate-50 text-xs text-gray-500">
                画像を選択してください
              </div>
            )
          ) : (
            <>
              <div className="w-full">
                <PosterPreview
                  templateImageUrl={templateUrl}
                  templateNo={templateNo}
                  isCustom={false}
                  customImageUrl={null}
                  noticeText={noticeText}
                  dateText={formatPosterDate(row.startDate, row.endDate)}
                  remarks={row.remarks}
                  vendorName={currentVendor.name ?? ''}
                  emergencyContact={contact}
                />
              </div>
              <p className="rounded bg-gray-900 px-2 py-1 text-center text-xs font-semibold text-white" data-testid="template-name">
                {templateName || 'テンプレート未選択'}
              </p>
            </>
          )}
        </aside>
      </div>

      <section className="space-y-1.5">
        <div className="flex flex-wrap items-end justify-between gap-2">
          <div className="min-w-0">
            <button
              type="button"
              aria-expanded={periodOpen}
              aria-controls={`${uid}-period`}
              onClick={togglePeriod}
              className="inline-flex items-center gap-1 text-sm font-semibold text-gray-800 hover:text-blue-700"
            >
              <span aria-hidden="true">{periodOpen ? '▼' : '▶'}</span>
              表示期間
            </button>
            {!periodOpen && <span className="ml-2 text-xs text-gray-500">{periodSummary}</span>}
          </div>
          <label className="flex items-center gap-1.5 text-sm text-gray-700">
            <span>表示時間（秒）</span>
            <input
              type="number"
              min={1}
              max={displayTimeMax}
              value={displayTime}
              onChange={(e) => setDisplayTime(e.target.value)}
              className={`${fieldBase} w-20`}
            />
          </label>
        </div>
        {periodOpen && (
          <div id={`${uid}-period`} className="space-y-1">
            <p className="text-xs text-gray-500">サイネージへの表示開始・終了日時を設定します（任意）</p>
            <div className="grid grid-cols-2 gap-3">
              <label className="space-y-1 text-sm text-gray-700">
                <span>表示開始</span>
                <div className="flex gap-1">
                  <input
                    type="date"
                    aria-label="表示開始日"
                    value={displayStartDate}
                    onChange={(e) => setDisplayStartDate(e.target.value)}
                    className={`${fieldBase} min-w-0 flex-1`}
                  />
                  <input
                    type="time"
                    aria-label="表示開始時刻"
                    value={displayStartTime}
                    onChange={(e) => setDisplayStartTime(e.target.value)}
                    className={`${fieldBase} w-28 shrink-0`}
                  />
                </div>
              </label>
              <label className="space-y-1 text-sm text-gray-700">
                <span>表示終了</span>
                <div className="flex gap-1">
                  <input
                    type="date"
                    aria-label="表示終了日"
                    value={displayEndDate}
                    onChange={(e) => setDisplayEndDate(e.target.value)}
                    className={`${fieldBase} min-w-0 flex-1`}
                  />
                  <input
                    type="time"
                    aria-label="表示終了時刻"
                    value={displayEndTime}
                    onChange={(e) => setDisplayEndTime(e.target.value)}
                    className={`${fieldBase} w-28 shrink-0`}
                  />
                </div>
              </label>
            </div>
          </div>
        )}
      </section>

      <PositionPicker name={`${uid}-position`} value={position} onChange={setPosition} />

      <div className="flex justify-end gap-3">
        <Button variant="secondary" onClick={onClose}>
          キャンセル
        </Button>
        <Button onClick={handleApply} disabled={uploading}>
          保存
        </Button>
      </div>
    </div>
  );
}

const POSITION_LABEL = Object.fromEntries(POSITIONS.map((p) => [p.value, p.label]));

/**
 * 貼紙表示位置をサイネージの画面図の上で選ぶ。左は縦長の画面（上段に ①上左 ②上中 ③上右、その下に ④中央、最下段は広告で選べない）、
 * 右は ⓪全体（画面全体）。中身は radio なので矢印キーで選び直せる（radiogroup の意味を保つ）
 */
function PositionPicker({ name, value, onChange }: { name: string; value: string; onChange: (v: string) => void }) {
  const cell = (v: string, className: string) => (
    <label
      key={v}
      className={cn(
        'flex cursor-pointer flex-col items-center justify-center gap-0.5 rounded-sm border-2 text-xs leading-tight font-semibold transition-colors',
        'has-[input:focus-visible]:ring-2 has-[input:focus-visible]:ring-blue-500 has-[input:focus-visible]:ring-offset-1',
        value === v
          ? 'border-blue-600 bg-blue-100 text-blue-800'
          : 'border-dashed border-gray-400 bg-white text-gray-700 hover:bg-blue-50',
        className,
      )}
    >
      <input
        type="radio"
        name={name}
        value={v}
        checked={value === v}
        onChange={() => onChange(v)}
        className="sr-only"
      />
      <span aria-hidden="true">{value === v ? '●' : '○'}</span>
      <span className="whitespace-nowrap">{POSITION_LABEL[v]}</span>
    </label>
  );

  return (
    <fieldset className="space-y-1">
      <legend className="text-sm font-semibold text-gray-800">貼紙表示位置</legend>
      <p className="text-xs text-gray-500">サイネージの画面図の上で、貼紙を出す枠をクリックして選びます</p>
      <div className="flex flex-wrap items-start gap-4">
        <div className="w-52" role="group" aria-label="サイネージ画面（枠ごと）">
          <div className="flex aspect-[3/4] flex-col gap-1 rounded-md border-4 border-gray-800 bg-gray-800 p-1">
            <div className="grid flex-[25] grid-cols-3 gap-1">
              {cell('1', '')}
              {cell('2', '')}
              {cell('3', '')}
            </div>
            {cell('4', 'flex-[35]')}
            <div
              aria-hidden="true"
              className="flex flex-[40] items-center justify-center rounded-sm bg-gray-300 text-[11px] text-gray-600"
            >
              広告（選べません）
            </div>
          </div>
        </div>
        <div className="w-52">
          <div className="flex aspect-[3/4] flex-col rounded-md border-4 border-gray-800 bg-gray-800 p-1">
            {cell('0', 'flex-1')}
          </div>
        </div>
      </div>
    </fieldset>
  );
}
