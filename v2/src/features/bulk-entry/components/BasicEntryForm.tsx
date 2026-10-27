import { useId, useRef, useState, type ReactNode } from 'react';
import { Button } from '@/components/ui/Button';
import { cn } from '@/lib/utils';
import { POSTER_PNG_SIZE } from '@/lib/constants';
import { safePosterUrl } from '@/lib/posterUrl';
import type { ExtraPoster } from '@/lib/extraPosters';
import { PosterPreview } from '@/features/single-entry/components/PosterPreview';
import { formatPosterDate } from '@/features/single-entry/lib/entryLogic';
import { LibraryPickerModal } from '@/features/poster-library/components/LibraryPickerModal';
import { ExtraPostersEditor } from '@/features/poster-library/components/ExtraPostersEditor';
import { POSITIONS, hasCustomDisplayPeriod, submittedDisplayPeriod } from '../utils/rowDetail';

/**
 * 基本フォーム（一括入力の行の「詳細設定」）。修正依頼1027(3) 決定③で、承認待ちの編集と差戻しの修正・再申請もこのフォームにした。
 * 値は呼び出し側が持つ（行・申請の行への書き戻し方がそれぞれ違うため）。ここは見た目と入力だけ。
 *
 * 表示期間の日付は「空＝既定」（表示開始日は申請日、表示終了日は点検終了日。submittedDisplayPeriod と同じ）。
 * 開いた欄には既定の日付を見せるが、書き換えるまでは空のまま持つ（点検日を直したら追従するように）
 */
export interface BasicFormValues {
  noticeText: string;
  contact: string;
  posterType: 'template' | 'custom';
  posterImage: string;
  extraPosters: ExtraPoster[];
  displayStartDate: string;
  displayStartTime: string;
  displayEndDate: string;
  displayEndTime: string;
  displayTime: string;
  position: string;
  /** メモ（CSV外）。showMemo のときだけ出す */
  memo: string;
  /** 点検種別。inspectionType を渡したときだけ出す */
  inspectionType: string;
}

/** テンプレートの貼紙（点検種別から呼び出し側が決める） */
export interface BasicFormTemplate {
  templateNo: string;
  templateUrl: string | null;
  /** テンプレート名（template_images.display_name。無ければ点検種別名） */
  templateName: string;
}

interface BasicEntryFormProps {
  values: BasicFormValues;
  onChange: (patch: Partial<BasicFormValues>) => void;
  /** 点検日（表示期間の既定とプレビューの日付） */
  startDate: string;
  endDate: string;
  /** 掲示備考（プレビュー用） */
  remarks: string;
  vendorName: string;
  /** 保守会社マスターの緊急連絡先（連絡先の既定） */
  vendorContact: string;
  /** 貼紙ライブラリを絞る物件 */
  propertyCode: string;
  template: BasicFormTemplate;
  displayTimeMax: number;
  displayTimeDefault: number;
  /** 申請日（表示開始日の既定。一括入力は UTC の日付、点検一覧は JST の日付） */
  today: string;
  uploading: boolean;
  uploadFile: (file: File) => Promise<string | null>;
  /** 右上に出すステータス（承認待ちの編集・差戻し） */
  status?: ReactNode;
  /** 点検種別（出すときだけ）。options を渡すと選び直せる（変えたらテンプレートNoも変わる） */
  inspectionType?: { options?: string[]; note?: string };
  /** プレビューの下に出す登録者・登録日時 */
  registrant?: { email: string; at: string };
  /** メモ（CSV外）の欄を出す */
  showMemo?: boolean;
  /** 案内文の上に差し込む欄（差戻しの再申請の点検日・掲示備考など） */
  header?: ReactNode;
  /** 下端のボタン */
  footer: ReactNode;
}

// 幅を含まない基本の見た目。cn は結合だけなので w-full と w-24 を並べると CSS の並び順で w-full が勝つ（幅は使う側で 1 つだけ付ける）
const fieldBase =
  'block rounded-md border border-gray-300 px-2 py-1 text-sm focus:border-blue-500 focus:outline-none disabled:bg-gray-100 disabled:text-gray-500';
// 案内文・連絡先は幅を狭くする（修正依頼1027(3)。プレビューを広く取り、文字を大きく見せる）
const narrow = 'w-full max-w-md';

/** プレビューに重ねる文字の倍率（修正依頼1027(3)。枠に収まらない欄は PosterPreview が縮める） */
const PREVIEW_TEXT_SCALE = 1.6;

export function BasicEntryForm({
  values,
  onChange,
  startDate,
  endDate,
  remarks,
  vendorName,
  vendorContact,
  propertyCode,
  template,
  displayTimeMax,
  displayTimeDefault,
  today,
  uploading,
  uploadFile,
  status,
  inspectionType,
  registrant,
  showMemo,
  header,
  footer,
}: BasicEntryFormProps) {
  const uid = useId();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [libraryOpen, setLibraryOpen] = useState(false);
  const isCustom = values.posterType === 'custom';
  const { noticeText, contact, posterImage, extraPosters, position, displayTime } = values;

  // 表示期間は既定（空・点検期間のまま）なら畳む
  const [periodOpen, setPeriodOpen] = useState(() => hasCustomDisplayPeriod({ ...values, startDate, endDate }));
  // 表示時間と貼紙表示位置は既定で自動設定される項目なので畳む（修正依頼1025 F7）。既定と違う値なら開いておく
  const [layoutOpen, setLayoutOpen] = useState(
    () => position !== '2' || (!!values.displayTime && Number(values.displayTime) !== displayTimeDefault),
  );

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const input = e.target;
    const file = input.files?.[0];
    if (!file) return;
    const url = await uploadFile(file);
    input.value = '';
    if (url) onChange({ posterImage: url });
  };

  const handleExtraFile = async (file: File) => {
    const url = await uploadFile(file);
    if (url) onChange({ extraPosters: [...extraPosters, { image_url: url, source: 'upload' }] });
  };

  // 畳んだときの要約は申請で保存される値で出す（表示開始日が空なら申請日）
  const shownPeriod = submittedDisplayPeriod({ ...values, startDate, endDate }, today);
  const periodSummary = `${shownPeriod.startDate || '申請日'}${shownPeriod.startTime ? ` ${shownPeriod.startTime}` : ''} 〜 ${
    shownPeriod.endDate || '点検終了日'
  }${shownPeriod.endTime ? ` ${shownPeriod.endTime}` : ''}`;
  // 開いた欄に見せる既定の日付（書き換えるまでは値を空のまま持つ）
  const shownStartDate = values.displayStartDate || today;
  const shownEndDate = values.displayEndDate || endDate || startDate;

  const typeOptions = inspectionType?.options
    ? [...new Set([values.inspectionType, ...inspectionType.options].filter(Boolean))]
    : null;

  return (
    <div className="space-y-2.5">
      {header}
      <div className="grid grid-cols-1 gap-3 md:grid-cols-[minmax(0,1fr)_17rem]">
        <div className="min-w-0 space-y-2">
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
              onChange={(e) => onChange({ noticeText: e.target.value })}
              rows={3}
              maxLength={200}
              disabled={isCustom}
              placeholder="例：エレベーター点検のため、一時的に停止いたします。"
              className={`${fieldBase} ${narrow}`}
            />
            <div className="flex max-w-md justify-between text-xs text-gray-500">
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
            <div className="flex max-w-md gap-1">
              <input
                id={`${uid}-contact`}
                type="text"
                value={contact}
                maxLength={50}
                placeholder="例: 092-000-0000"
                onChange={(e) => onChange({ contact: e.target.value })}
                className={`${fieldBase} min-w-0 flex-1`}
              />
              {contact !== vendorContact && (
                <Button type="button" variant="secondary" size="sm" onClick={() => onChange({ contact: vendorContact })}>
                  既定に戻す
                </Button>
              )}
            </div>
          </section>

          <fieldset className="space-y-1">
            <legend className="text-sm font-semibold text-gray-800">貼紙</legend>
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
              <label className="inline-flex items-center gap-1">
                <input
                  type="radio"
                  name={`${uid}-poster-type`}
                  value="template"
                  checked={!isCustom}
                  onChange={() => onChange({ posterType: 'template' })}
                />
                テンプレート
              </label>
              {/* テンプレートNo（修正依頼1027(3)。点検種別で決まる） */}
              {!isCustom && (
                <span className="inline-flex items-center gap-2 rounded border border-gray-300 px-1.5 py-0.5 text-xs">
                  <span className="text-gray-500">テンプレートNo</span>
                  <span className="font-mono text-gray-900" data-testid="template-no">
                    {template.templateNo || '－'}
                  </span>
                </span>
              )}
              <label className="inline-flex items-center gap-1">
                <input
                  type="radio"
                  name={`${uid}-poster-type`}
                  value="custom"
                  checked={isCustom}
                  onChange={() => onChange({ posterType: 'custom' })}
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
                    <Button type="button" variant="danger" size="sm" disabled={uploading} onClick={() => onChange({ posterImage: '' })}>
                      削除
                    </Button>
                  </div>
                ) : (
                  <div className="flex gap-2">
                    <button
                      type="button"
                      disabled={uploading}
                      onClick={() => fileInputRef.current?.click()}
                      className="flex-1 rounded-md border-2 border-dashed border-gray-300 p-3 text-center text-sm text-gray-600 hover:bg-gray-50 disabled:opacity-60"
                    >
                      {uploading ? '変換・アップロード中…' : 'クリックして画像を選択'}
                      <br />
                      <small>
                        JPG, PNG, PDF形式（5MB以下）。PDF は1ページ目を {POSTER_PNG_SIZE.width}×{POSTER_PNG_SIZE.height} の PNG に変換します
                      </small>
                    </button>
                    {/* 文字を合成しない貼紙を貼紙ライブラリから選ぶ（修正依頼1025 D2） */}
                    <button
                      type="button"
                      disabled={uploading}
                      onClick={() => setLibraryOpen(true)}
                      className="w-36 shrink-0 rounded-md border-2 border-dashed border-blue-300 p-3 text-center text-sm text-blue-700 hover:bg-blue-50 disabled:opacity-60"
                    >
                      ライブラリから選ぶ
                      <br />
                      <small className="text-gray-500">騒音注意・駐車禁止など</small>
                    </button>
                  </div>
                )}
                {libraryOpen && (
                  <LibraryPickerModal
                    open
                    propertyCode={propertyCode}
                    onClose={() => setLibraryOpen(false)}
                    onSelect={(item) => {
                      setLibraryOpen(false);
                      onChange({ posterImage: item.image_url });
                    }}
                  />
                )}
              </div>
            )}
          </fieldset>

          {/* 2枚目以降の貼紙（修正依頼1025 D3）。テンプレートの貼紙にも足せる。CSV では枚数分の行になる */}
          <ExtraPostersEditor
            items={extraPosters.map((x, i) => ({
              key: `${i}:${x.image_url}`,
              url: safePosterUrl(x.image_url),
              label: x.source === 'library' ? 'ライブラリ' : 'アップロード',
              position: x.position ?? null,
            }))}
            propertyCode={propertyCode}
            busy={uploading}
            onUpload={handleExtraFile}
            onPickLibrary={(item) =>
              // 同じライブラリの貼紙は1回だけ（DB も同じ要素の重複を断る）
              extraPosters.some((x) => x.source === 'library' && x.library_id === item.id)
                ? undefined
                : onChange({ extraPosters: [...extraPosters, { image_url: item.image_url, source: 'library', library_id: item.id }] })
            }
            onRemove={(index) => onChange({ extraPosters: extraPosters.filter((_, i) => i !== index) })}
            onPositionChange={(index, pos) =>
              onChange({ extraPosters: extraPosters.map((x, i) => (i === index ? withPosition(x, pos) : x)) })
            }
          />

          {showMemo && (
            <section className="space-y-1">
              <label htmlFor={`${uid}-memo`} className="text-sm font-semibold text-gray-800">
                メモ（CSV外）
              </label>
              <textarea
                id={`${uid}-memo`}
                value={values.memo}
                onChange={(e) => onChange({ memo: e.target.value })}
                rows={1}
                maxLength={500}
                placeholder="CSV には出ない覚え書き"
                className={`${fieldBase} ${narrow}`}
              />
            </section>
          )}
        </div>

        <aside className="min-w-0 space-y-1" aria-label="貼紙のプレビュー">
          {status && (
            <div className="flex items-center justify-end gap-1.5 text-xs text-gray-500" data-testid="entry-status">
              ステータス {status}
            </div>
          )}
          {isCustom ? (
            posterImage ? (
              <img
                src={safePosterUrl(posterImage) ?? undefined}
                alt="追加の貼紙"
                className="mx-auto max-h-80 w-auto max-w-full rounded border border-gray-200 object-contain"
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
                  templateImageUrl={template.templateUrl}
                  templateNo={template.templateNo}
                  isCustom={false}
                  customImageUrl={null}
                  noticeText={noticeText}
                  dateText={formatPosterDate(startDate, endDate)}
                  remarks={remarks}
                  vendorName={vendorName}
                  emergencyContact={contact}
                  textScale={PREVIEW_TEXT_SCALE}
                />
              </div>
              <p className="rounded bg-gray-900 px-2 py-1 text-center text-xs font-semibold text-white" data-testid="template-name">
                {template.templateName || 'テンプレート未選択'}
              </p>
            </>
          )}
          {/* 2枚目以降の貼紙（修正依頼1025 D3）を枚数分 */}
          {extraPosters.length > 0 && (
            <div className="space-y-1 border-t border-gray-200 pt-1" data-testid="extra-poster-previews">
              <p className="text-xs font-medium text-gray-600">追加の貼紙（{extraPosters.length}枚）</p>
              <ul className="grid grid-cols-2 gap-1">
                {extraPosters.map((x, i) => (
                  <li key={`${i}:${x.image_url}`} className="text-center">
                    <img
                      src={safePosterUrl(x.image_url) ?? undefined}
                      alt={`${i + 2}枚目の貼紙`}
                      className="mx-auto max-h-32 w-auto max-w-full rounded border border-gray-200 object-contain"
                    />
                    <span className="text-[11px] text-gray-500">{i + 2}枚目</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
          {/* 点検種別・登録者・登録日時（修正依頼1027(3)） */}
          {(inspectionType || registrant) && (
            <dl
              data-testid="registrant"
              className="grid grid-cols-[4.5rem_minmax(0,1fr)] items-center gap-x-1.5 gap-y-0.5 rounded border border-gray-200 px-1.5 py-1 text-xs">
              {inspectionType && (
                <>
                  <dt className="text-gray-500">
                    <label htmlFor={`${uid}-type`}>点検種別</label>
                  </dt>
                  <dd className="min-w-0">
                    {typeOptions ? (
                      <select
                        id={`${uid}-type`}
                        value={values.inspectionType}
                        onChange={(e) => onChange({ inspectionType: e.target.value })}
                        className={`${fieldBase} w-full px-1 py-0.5 text-xs`}
                      >
                        {typeOptions.map((t) => (
                          <option key={t} value={t}>
                            {t}
                          </option>
                        ))}
                      </select>
                    ) : (
                      <span id={`${uid}-type`} className="block truncate text-gray-900" title={values.inspectionType}>
                        {values.inspectionType || '－'}
                      </span>
                    )}
                  </dd>
                  {inspectionType.note && <dd className="col-span-2 text-[11px] text-amber-700">{inspectionType.note}</dd>}
                </>
              )}
              {registrant && (
                <>
                  <dt className="text-gray-500">登録者</dt>
                  <dd className="truncate text-gray-900" title={registrant.email}>
                    {registrant.email}
                  </dd>
                  <dt className="text-gray-500">登録日時</dt>
                  <dd className="text-gray-900">{registrant.at}</dd>
                </>
              )}
            </dl>
          )}
        </aside>
      </div>

      <section className="space-y-1.5">
        <div className="min-w-0">
          <button
            type="button"
            aria-expanded={periodOpen}
            aria-controls={`${uid}-period`}
            onClick={() => setPeriodOpen((o) => !o)}
            className="inline-flex items-center gap-1 text-sm font-semibold text-gray-800 hover:text-blue-700"
          >
            <span aria-hidden="true">{periodOpen ? '▼' : '▶'}</span>
            表示期間
          </button>
          {!periodOpen && <span className="ml-2 text-xs text-gray-500">{periodSummary}</span>}
        </div>
        {periodOpen && (
          <div id={`${uid}-period`} className="space-y-1">
            <p className="text-xs text-gray-500">
              サイネージへの表示開始・終了日時を設定します（任意。既定は表示開始が申請日、表示終了が点検終了日）
            </p>
            <div className="grid max-w-2xl grid-cols-2 gap-3">
              <label className="space-y-1 text-sm text-gray-700">
                <span>表示開始</span>
                <div className="flex gap-1">
                  <input
                    type="date"
                    aria-label="表示開始日"
                    value={shownStartDate}
                    onChange={(e) => onChange({ displayStartDate: e.target.value })}
                    className={`${fieldBase} min-w-0 flex-1`}
                  />
                  <input
                    type="time"
                    aria-label="表示開始時刻"
                    value={values.displayStartTime}
                    onChange={(e) => onChange({ displayStartTime: e.target.value })}
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
                    value={shownEndDate}
                    onChange={(e) => onChange({ displayEndDate: e.target.value })}
                    className={`${fieldBase} min-w-0 flex-1`}
                  />
                  <input
                    type="time"
                    aria-label="表示終了時刻"
                    value={values.displayEndTime}
                    onChange={(e) => onChange({ displayEndTime: e.target.value })}
                    className={`${fieldBase} w-28 shrink-0`}
                  />
                </div>
              </label>
            </div>
          </div>
        )}
      </section>

      {/* 表示時間と貼紙表示位置は既定で自動設定される項目なので、通常は畳む（▶で開く。修正依頼1025 F7） */}
      <section className="space-y-1.5">
        <div className="min-w-0">
          <button
            type="button"
            aria-expanded={layoutOpen}
            aria-controls={`${uid}-layout`}
            onClick={() => setLayoutOpen((o) => !o)}
            className="inline-flex items-center gap-1 text-sm font-semibold text-gray-800 hover:text-blue-700"
          >
            <span aria-hidden="true">{layoutOpen ? '▼' : '▶'}</span>
            表示時間・貼紙表示位置
          </button>
          {!layoutOpen && (
            <span className="ml-2 text-xs text-gray-500">
              {displayTime || displayTimeDefault}秒・{POSITION_LABEL[position] ?? position}（既定で自動設定）
            </span>
          )}
        </div>
        {layoutOpen && (
          <div id={`${uid}-layout`} className="space-y-2">
            <label className="flex items-center gap-1.5 text-sm text-gray-700">
              <span>表示時間（秒）</span>
              <input
                type="number"
                min={1}
                max={displayTimeMax}
                value={displayTime}
                onChange={(e) => onChange({ displayTime: e.target.value })}
                className={`${fieldBase} w-20`}
              />
            </label>
            <PositionPicker name={`${uid}-position`} value={position} onChange={(v) => onChange({ position: v })} />
          </div>
        )}
      </section>

      {footer}
    </div>
  );
}

/** 追加の貼紙の位置を変える（null は1枚目と同じ＝position を持たない） */
function withPosition(x: ExtraPoster, position: string | null): ExtraPoster {
  const next: ExtraPoster = { image_url: x.image_url, source: x.source };
  if (x.library_id) next.library_id = x.library_id;
  if (position) next.position = position;
  return next;
}

const POSITION_LABEL = Object.fromEntries(POSITIONS.map((p) => [p.value, p.label]));

/** 貼紙表示位置の値（POSITIONS に無ければ既定の ②上中） */
export function normalizePosition(v: string | number | null | undefined): string {
  const s = v === null || v === undefined ? '2' : String(v);
  return POSITIONS.some((p) => p.value === s) ? s : '2';
}

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
