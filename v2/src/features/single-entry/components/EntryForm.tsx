import { useRef, useState } from 'react';
import { Input } from '@/components/ui/Input';
import { TextArea } from '@/components/ui/TextArea';
import { Select } from '@/components/ui/Select';
import { Combobox, type ComboboxOption } from '@/components/ui/Combobox';
import { Button } from '@/components/ui/Button';
import { POSTER_PNG_SIZE, PosterType } from '@/lib/constants';
import { preparePosterImage } from '@/lib/pdfToPng';
import { cn } from '@/lib/utils';
import type { AppSettings } from '@/lib/api/single-entry';
import type { DbInspectionType, Terminal } from '@/types/database';
import type { EntryFormApi } from '../hooks/useEntryForm';
import { CATEGORY_OPTIONS, defaultNoticeText, noticeUsage, remarksUsage } from '../lib/entryLogic';
import { customImageName } from '../types';
import { LibraryPickerModal } from '@/features/poster-library/components/LibraryPickerModal';
import { ExtraPostersEditor } from '@/features/poster-library/components/ExtraPostersEditor';

interface EntryFormProps {
  form: EntryFormApi;
  propertyOptions: ComboboxOption[];
  terminals: Terminal[];
  /** 今のカテゴリで絞った点検種別（紐付け済みが先頭） */
  inspectionTypes: DbInspectionType[];
  /** 全点検種別（案内文の既定文を引く） */
  allInspectionTypes: DbInspectionType[];
  /** 保守会社に紐付いた点検種別（選択肢を「紐付け済み」「その他」に分ける） */
  linkedIds: ReadonlySet<string>;
  /** 案内文・備考の文字数・行数の上限（残りの表示に使う） */
  settings: AppSettings;
  /** 作成データの行を編集中か */
  editing: boolean;
  onCancelEdit: () => void;
  signageOnly: boolean;
  onSignageOnlyChange: (checked: boolean) => void;
  onAdd: () => void;
  onDuplicate: () => void;
  canDuplicate: boolean;
  onImageError: (message: string) => void;
  /** 画像選択の知らせ（複数ページの PDF は1ページ目を使う、など） */
  onImageNotice?: (message: string) => void;
}

const categoryOptions = CATEGORY_OPTIONS.map((c) => ({ value: c, label: c }));

const LINKED_GROUP = '紐付け済み';
const OTHER_GROUP = 'その他';
const INSPECTION_GROUPS = [LINKED_GROUP, OTHER_GROUP];

/** 掲示内容入力（v1 index.html .form-section） */
// v1: index.html 掲示内容入力 / js/script.js onPosterTypeChange
export function EntryForm({
  form,
  propertyOptions,
  terminals,
  inspectionTypes,
  allInspectionTypes,
  linkedIds,
  settings,
  editing,
  onCancelEdit,
  signageOnly,
  onSignageOnlyChange,
  onAdd,
  onDuplicate,
  canDuplicate,
  onImageError,
  onImageNotice,
}: EntryFormProps) {
  const { values, customImage } = form;
  const isCustom = values.posterType === PosterType.CUSTOM;
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [libraryOpen, setLibraryOpen] = useState(false);

  const terminalOptions = terminals.map((t) => ({
    value: t.terminal_id,
    label: t.supplement ? `${t.terminal_id} (${t.supplement})` : t.terminal_id,
  }));
  // 紐付けがある保守会社だけ「紐付け済み」「その他」の見出しで分ける（並びと初期選択は filterInspectionTypes のまま）
  const inspectionOptions: ComboboxOption[] = inspectionTypes.map((t) =>
    linkedIds.size > 0
      ? { value: t.id, label: t.inspection_name, group: linkedIds.has(t.id) ? LINKED_GROUP : OTHER_GROUP }
      : { value: t.id, label: t.inspection_name },
  );
  const noticeDefault = defaultNoticeText(allInspectionTypes, values.inspectionTypeId);
  // 手で書き換えた案内文はカテゴリを変えても（種別が同じなら）残すので、既定文と違うときは戻すボタンを出す（既定文の無い種別は出さない）
  const noticeEdited = noticeDefault !== '' && values.noticeText !== noticeDefault;
  const notice = noticeUsage(values.noticeText, settings);
  const remarks = remarksUsage(values.remarks, settings);

  // v1: js/script.js onImageSelected
  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const input = e.target;
    const file = input.files?.[0];
    if (!file) return;
    // PDF は1ページ目を PNG に変換してから選ぶ（B18。一括入力の詳細設定と同じユーティリティ）
    let prepared: Awaited<ReturnType<typeof preparePosterImage>>;
    try {
      prepared = await preparePosterImage(file);
    } catch (e) {
      onImageError(e instanceof Error ? e.message : '画像を選択できませんでした');
      input.value = '';
      return;
    }
    const error = await form.selectImage(prepared.file);
    if (error) {
      onImageError(error);
      input.value = '';
      return;
    }
    if (prepared.notice) onImageNotice?.(prepared.notice);
  };

  // 2枚目以降の貼紙をアップロードで足す（PDF は1ページ目を PNG にする。1枚目と同じ）
  const handleExtraFile = async (file: File) => {
    try {
      const prepared = await preparePosterImage(file);
      const error = await form.addExtraUpload(prepared.file);
      if (error) onImageError(error);
      else if (prepared.notice) onImageNotice?.(prepared.notice);
    } catch (e) {
      onImageError(e instanceof Error ? e.message : '画像を選択できませんでした');
    }
  };

  // v1: js/script.js clearCustomImage
  const handleClearImage = () => {
    form.clearImage();
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  // 入力欄はスクロール領域、「データを追加」（編集中は「更新」「編集をやめる」）「前回を複製」の行はその外（段階B で常に見える）
  return (
    <div className="tall:flex tall:min-h-0 tall:flex-1 tall:flex-col">
      <div className="grid grid-cols-1 content-start gap-x-3 gap-y-2 p-3 sm:grid-cols-2 tall:min-h-0 tall:flex-1 tall:overflow-y-auto">
        {/* 物件・端末 */}
        <div className="space-y-0.5">
          <div className="flex items-baseline gap-2">
            <label htmlFor="se-property" className="text-xs font-medium text-gray-600">
              物件コード <span className="text-red-600">*</span>
            </label>
            <label className="inline-flex items-center gap-1 text-xs text-gray-600">
              <input
                type="checkbox"
                checked={signageOnly}
                onChange={(e) => onSignageOnlyChange(e.target.checked)}
              />
              サイネージ設置物件のみ
            </label>
          </div>
          {/* コード・物件名の一部で絞り込める。「端末なし」はサイネージ未設置の物件 */}
          <Combobox
            id="se-property"
            placeholder="コード・物件名で検索"
            options={propertyOptions}
            value={values.propertyCode}
            onChange={form.changeProperty}
          />
        </div>
        {values.propertyCode && terminals.length === 0 ? (
          // 端末の無い物件でも入力・申請はできる。選ぶものが無いことだけ示す
          <div className="space-y-0.5">
            <p className="text-xs font-medium text-gray-600">端末ID</p>
            <p className="rounded-md border border-dashed border-gray-300 bg-gray-50 px-2 py-1.5 text-sm text-gray-600">
              サイネージ未設置（端末なし）
            </p>
          </div>
        ) : (
          <Select
            id="se-terminal"
            label="端末ID"
            placeholder="選択してください"
            options={terminalOptions}
            value={values.terminalId}
            onChange={(e) => form.setField('terminalId', e.target.value)}
          />
        )}

        {/* 点検内容 */}
        <Select
          id="se-category"
          label="案内カテゴリ"
          placeholder="全て"
          options={categoryOptions}
          value={values.category}
          onChange={(e) => form.changeCategory(e.target.value)}
        />
        {/* 追加の貼紙でも出す（必須。点検行への結び付けに使う。隠すと選び忘れたまま申請できた。修正依頼1024 本番確認 ②） */}
        <Combobox
          id="se-inspection-type"
          label="点検工事案内"
          required
          placeholder="選択してください"
          options={inspectionOptions}
          groups={INSPECTION_GROUPS}
          value={values.inspectionTypeId}
          onChange={form.changeInspectionType}
        />

        <fieldset className="space-y-0.5">
          <legend className="text-xs font-medium text-gray-600">貼紙</legend>
          <div className="flex gap-4 pt-1 text-sm">
            <label className="inline-flex items-center gap-1">
              <input
                type="radio"
                name="se-poster-type"
                value={PosterType.TEMPLATE}
                checked={!isCustom}
                onChange={() => form.setField('posterType', PosterType.TEMPLATE)}
              />
              テンプレート
            </label>
            <label className="inline-flex items-center gap-1">
              <input
                type="radio"
                name="se-poster-type"
                value={PosterType.CUSTOM}
                checked={isCustom}
                onChange={() => form.setField('posterType', PosterType.CUSTOM)}
              />
              追加
            </label>
          </div>
        </fieldset>

        {/* 画像アップロード（追加のときだけ） */}
        {isCustom && (
          <div className="space-y-0.5 sm:col-span-2">
            <p className="text-xs font-medium text-gray-600">
              貼紙画像 <span className="text-red-600">*</span>
            </p>
            <input
              ref={fileInputRef}
              type="file"
              accept=".jpg,.jpeg,.png,.pdf,image/jpeg,image/png,application/pdf"
              onChange={(e) => void handleFile(e)}
              className="hidden"
              aria-label="貼紙画像"
            />
            {customImage ? (
              <div className="flex items-center gap-3 rounded-md border border-gray-200 p-2">
                <img src={customImage.dataUrl} alt="プレビュー" className="max-h-32 rounded" />
                <div className="min-w-0 space-y-1">
                  <p className="truncate text-xs text-gray-600">
                    {`${customImage.libraryId ? 'ライブラリ: ' : ''}${customImageName(customImage)}`}
                  </p>
                  <Button type="button" variant="danger" size="sm" onClick={handleClearImage}>
                    削除
                  </Button>
                </div>
              </div>
            ) : (
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="flex-1 rounded-md border-2 border-dashed border-gray-300 p-3 text-center text-sm text-gray-600 hover:bg-gray-50"
                >
                  クリックして画像を選択
                  <br />
                  <small>
                    JPG, JPEG, PNG, PDF形式（5MB以下）。PDF は1ページ目を {POSTER_PNG_SIZE.width}×{POSTER_PNG_SIZE.height} の PNG に変換します
                  </small>
                </button>
                {/* 文字を合成しない貼紙（騒音注意・駐車禁止など）を貼紙ライブラリから選ぶ（修正依頼1025 D2） */}
                <button
                  type="button"
                  onClick={() => setLibraryOpen(true)}
                  className="w-36 shrink-0 rounded-md border-2 border-dashed border-blue-300 p-3 text-center text-sm text-blue-700 hover:bg-blue-50"
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
              propertyCode={values.propertyCode}
              onClose={() => setLibraryOpen(false)}
              onSelect={(item) => {
                setLibraryOpen(false);
                form.selectLibraryImage(item);
                if (fileInputRef.current) fileInputRef.current.value = '';
              }}
            />
)}
          </div>
        )}

        {form.posterNotice && (
          <p role="status" className="text-xs text-amber-700 sm:col-span-2">
            {form.posterNotice}
          </p>
        )}

        {/* 2枚目以降の貼紙（修正依頼1025 D3）。テンプレートの貼紙にも足せる。CSV では枚数分の行になる */}
        <div className="sm:col-span-2">
          <ExtraPostersEditor
            items={form.extraPosters.map((x, i) => ({
              key: `${i}:${x.dataUrl.slice(-24)}`,
              url: x.dataUrl,
              label: `${x.libraryId ? 'ライブラリ: ' : ''}${customImageName(x)}`,
              position: x.position,
            }))}
            propertyCode={values.propertyCode}
            onUpload={handleExtraFile}
            onPickLibrary={form.addExtraLibrary}
            onRemove={form.removeExtra}
            onPositionChange={form.setExtraPosition}
          />
        </div>

        {/* 案内文（テンプレートのときだけ） */}
        {!isCustom && (
          <div className="space-y-0.5 sm:col-span-2">
            <TextArea
              id="se-notice-text"
              label="掲示板用案内文"
              rows={2}
              value={values.noticeText}
              onChange={(e) => form.setField('noticeText', e.target.value)}
            />
            <div className="flex items-center justify-between gap-2 text-xs text-gray-500">
              <span>
                {noticeEdited && (
                  <>
                    既定の案内文から書き換えています
                    <button
                      type="button"
                      onClick={() => form.setField('noticeText', noticeDefault)}
                      className="ml-2 text-blue-600 underline hover:text-blue-800"
                    >
                      既定文に戻す
                    </button>
                  </>
                )}
              </span>
              <span className={cn('shrink-0', notice.over && 'font-medium text-red-600')}>
                {notice.chars}/{notice.max}字
              </span>
            </div>
          </div>
        )}

        <p className="border-b border-gray-200 pb-1 text-sm font-semibold text-gray-700 sm:col-span-2">
          点検期間
        </p>
        <Input
          id="se-start-date"
          label="点検開始日"
          type="date"
          value={values.startDate}
          onChange={(e) => form.changeStartDate(e.target.value)}
        />
        <Input
          id="se-end-date"
          label="点検終了日"
          type="date"
          value={values.endDate}
          onChange={(e) => form.changeEndDate(e.target.value)}
        />

        <div className="space-y-0.5 sm:col-span-2">
          <TextArea
            id="se-remarks"
            label="備考（作業時間を記載下さい）"
            rows={3}
            placeholder="例: 10:00～12:00 / No2号機11:00～12:00"
            value={values.remarks}
            disabled={isCustom}
            className={isCustom ? 'bg-gray-200' : undefined}
            onChange={(e) => form.setField('remarks', e.target.value)}
          />
          {!isCustom && (
            <p className={cn('text-right text-xs text-gray-500', remarks.over && 'font-medium text-red-600')}>
              {remarks.lines}/{remarks.maxLines}行・1行最長 {remarks.longest}/{remarks.perLine}字
            </p>
          )}
        </div>
        {/* メモは掲示・CSV に出さない（点検月の変更などの覚え書き。承認の画面で管理者が見る） */}
        <div className="sm:col-span-2">
          <Input
            id="se-memo"
            label="メモ（掲示・CSVには出ません）"
            placeholder="例: 点検月を11月に変更"
            value={values.memo}
            maxLength={500}
            onChange={(e) => form.setField('memo', e.target.value)}
          />
        </div>
      </div>
      <div className="flex shrink-0 gap-2 border-t border-gray-200 px-3 py-2">
        {/* 編集中は押すと上書きになるので「更新」と出し、やめる手段を並べる */}
        <Button type="button" variant="primary" className="flex-1" onClick={onAdd}>
          {editing ? '更新' : 'データを追加'}
        </Button>
        {editing && (
          <Button type="button" variant="secondary" className="flex-1" onClick={onCancelEdit}>
            編集をやめる
          </Button>
        )}
        <Button
          type="button"
          variant="secondary"
          className="flex-1"
          onClick={onDuplicate}
          disabled={!canDuplicate}
        >
          前回を複製
        </Button>
      </div>
    </div>
  );
}
