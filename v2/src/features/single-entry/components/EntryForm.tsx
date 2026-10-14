import { useRef } from 'react';
import { Input } from '@/components/ui/Input';
import { TextArea } from '@/components/ui/TextArea';
import { Select } from '@/components/ui/Select';
import { Button } from '@/components/ui/Button';
import { PosterType } from '@/lib/constants';
import type { DbInspectionType, Terminal } from '@/types/database';
import type { EntryFormApi } from '../hooks/useEntryForm';
import { CATEGORY_OPTIONS } from '../lib/entryLogic';

interface EntryFormProps {
  form: EntryFormApi;
  propertyOptions: { value: string; label: string }[];
  terminals: Terminal[];
  inspectionTypes: DbInspectionType[];
  signageOnly: boolean;
  onSignageOnlyChange: (checked: boolean) => void;
  onAdd: () => void;
  onDuplicate: () => void;
  canDuplicate: boolean;
  onImageError: (message: string) => void;
}

const categoryOptions = CATEGORY_OPTIONS.map((c) => ({ value: c, label: c }));

/** 掲示内容入力（v1 index.html .form-section） */
// v1: index.html 掲示内容入力 / js/script.js onPosterTypeChange
export function EntryForm({
  form,
  propertyOptions,
  terminals,
  inspectionTypes,
  signageOnly,
  onSignageOnlyChange,
  onAdd,
  onDuplicate,
  canDuplicate,
  onImageError,
}: EntryFormProps) {
  const { values, customImage } = form;
  const isCustom = values.posterType === PosterType.CUSTOM;
  const fileInputRef = useRef<HTMLInputElement>(null);

  const terminalOptions = terminals.map((t) => ({
    value: t.terminal_id,
    label: t.supplement ? `${t.terminal_id} (${t.supplement})` : t.terminal_id,
  }));
  const inspectionOptions = inspectionTypes.map((t) => ({ value: t.id, label: t.inspection_name }));

  // v1: js/script.js onImageSelected
  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const input = e.target;
    const file = input.files?.[0];
    if (!file) return;
    const error = await form.selectImage(file);
    if (error) {
      onImageError(error);
      input.value = '';
    }
  };

  // v1: js/script.js clearCustomImage
  const handleClearImage = () => {
    form.clearImage();
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
      {/* 物件・端末 */}
      <div className="space-y-1">
        <div className="flex items-baseline gap-2">
          <label htmlFor="se-property" className="text-sm font-medium text-gray-700">
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
        <Select
          id="se-property"
          placeholder="選択してください"
          options={propertyOptions}
          value={values.propertyCode}
          onChange={(e) => form.changeProperty(e.target.value)}
        />
      </div>
      <Select
        id="se-terminal"
        label="端末ID"
        placeholder="選択してください"
        options={terminalOptions}
        value={values.terminalId}
        onChange={(e) => form.setField('terminalId', e.target.value)}
      />

      {/* 点検内容 */}
      <Select
        id="se-category"
        label="案内カテゴリ"
        placeholder="全て"
        options={categoryOptions}
        value={values.category}
        onChange={(e) => form.changeCategory(e.target.value)}
      />
      {!isCustom && (
        <Select
          id="se-inspection-type"
          label="点検工事案内 *"
          placeholder="選択してください"
          options={inspectionOptions}
          value={values.inspectionTypeId}
          onChange={(e) => form.changeInspectionType(e.target.value)}
        />
      )}

      <fieldset className="space-y-1">
        <legend className="text-sm font-medium text-gray-700">貼紙</legend>
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
        <div className="space-y-1 sm:col-span-2">
          <p className="text-sm font-medium text-gray-700">
            貼紙画像 <span className="text-red-600">*</span>
          </p>
          <input
            ref={fileInputRef}
            type="file"
            accept=".jpg,.jpeg,.png"
            onChange={(e) => void handleFile(e)}
            className="hidden"
            aria-label="貼紙画像"
          />
          {customImage ? (
            <div className="flex items-center gap-3 rounded-md border border-gray-200 p-2">
              <img src={customImage.dataUrl} alt="プレビュー" className="max-h-32 rounded" />
              <Button type="button" variant="danger" size="sm" onClick={handleClearImage}>
                削除
              </Button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="w-full rounded-md border-2 border-dashed border-gray-300 p-4 text-center text-sm text-gray-600 hover:bg-gray-50"
            >
              クリックして画像を選択
              <br />
              <small>JPG, JPEG, PNG形式（5MB以下）</small>
            </button>
          )}
        </div>
      )}

      {/* 案内文（テンプレートのときだけ） */}
      {!isCustom && (
        <div className="sm:col-span-2">
          <TextArea
            id="se-notice-text"
            label="掲示板用案内文"
            rows={2}
            value={values.noticeText}
            onChange={(e) => form.setField('noticeText', e.target.value)}
          />
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

      <div className="sm:col-span-2">
        <TextArea
          id="se-remarks"
          label="作業時間及び備考"
          rows={2}
          placeholder="例：10:00〜12:00"
          value={values.remarks}
          disabled={isCustom}
          className={isCustom ? 'bg-gray-200' : undefined}
          onChange={(e) => form.setField('remarks', e.target.value)}
        />
      </div>

      <div className="flex gap-2 border-t border-gray-200 pt-3 sm:col-span-2">
        <Button type="button" variant="primary" className="flex-1" onClick={onAdd}>
          データを追加
        </Button>
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
