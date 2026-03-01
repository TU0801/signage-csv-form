import { useState, useRef } from 'react';
import type { UseFormReturn } from 'react-hook-form';
import { Input } from '@/components/ui/Input';
import { TextArea } from '@/components/ui/TextArea';
import { Select } from '@/components/ui/Select';
import { Button } from '@/components/ui/Button';
import type { EntryFormData } from '@/types/app';
import type { DbProperty, DbVendor, DbInspectionType } from '@/types/database';
import type { Terminal } from '@/types/database';
import { CascadingSelects } from './CascadingSelects';

interface EntryFormProps {
  form: UseFormReturn<EntryFormData>;
  properties: DbProperty[];
  vendors: DbVendor[];
  filteredInspectionTypes: DbInspectionType[];
  categoryOptions: { value: string; label: string }[];
  selectedCategoryId: string;
  terminals: Terminal[];
  onPropertyChange: (propertyCode: string) => void;
  onVendorChange: (vendorName: string) => void;
  onCategoryChange: (categoryId: string) => void;
  onInspectionTypeChange: (inspectionName: string) => void;
  onPreview: (templateNo: string) => void;
  onSubmit: (data: EntryFormData, customImageFile?: File) => void;
  onReset: () => void;
  isEditing: boolean;
}

const posterTypeOptions = [
  { value: 'template', label: 'テンプレート' },
  { value: 'custom', label: 'カスタム' },
];

const posterPositionOptions = [
  { value: '0', label: '全面' },
  { value: '1', label: '左上' },
  { value: '2', label: '右上' },
  { value: '3', label: '左下' },
  { value: '4', label: '右下' },
];

export function EntryForm({
  form,
  properties,
  vendors,
  filteredInspectionTypes,
  categoryOptions,
  selectedCategoryId,
  terminals,
  onPropertyChange,
  onVendorChange,
  onCategoryChange,
  onInspectionTypeChange,
  onPreview,
  onSubmit,
  onReset,
  isEditing,
}: EntryFormProps) {
  const {
    register,
    handleSubmit,
    watch,
    formState: { errors },
  } = form;

  const templateNo = watch('templateNo');
  const posterType = watch('posterType');

  // カスタム画像ファイル管理
  const [customImageFile, setCustomImageFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleImageSelected = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const validTypes = ['image/jpeg', 'image/jpg', 'image/png'];
    if (!validTypes.includes(file.type)) {
      alert('JPG, JPEG, PNG形式の画像を選択してください');
      e.target.value = '';
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      alert('画像サイズは5MB以下にしてください');
      e.target.value = '';
      return;
    }

    setCustomImageFile(file);
    const url = URL.createObjectURL(file);
    setPreviewUrl(url);
  };

  const handleClearImage = () => {
    setCustomImageFile(null);
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setPreviewUrl(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleFormSubmit = (data: EntryFormData) => {
    onSubmit(data, customImageFile ?? undefined);
    handleClearImage();
  };

  const handleReset = () => {
    handleClearImage();
    onReset();
  };

  return (
    <form onSubmit={handleSubmit(handleFormSubmit)} className="space-y-6">
      {/* 連動セレクト */}
      <fieldset className="space-y-4">
        <legend className="text-sm font-semibold text-gray-900 mb-2">物件・保守会社・点検種別</legend>
        <CascadingSelects
          form={form}
          properties={properties}
          vendors={vendors}
          filteredInspectionTypes={filteredInspectionTypes}
          categoryOptions={categoryOptions}
          selectedCategoryId={selectedCategoryId}
          terminals={terminals}
          onPropertyChange={onPropertyChange}
          onVendorChange={onVendorChange}
          onCategoryChange={onCategoryChange}
          onInspectionTypeChange={onInspectionTypeChange}
        />
      </fieldset>

      {/* テンプレート */}
      <fieldset className="space-y-4">
        <legend className="text-sm font-semibold text-gray-900 mb-2">テンプレート設定</legend>
        <div className="flex items-end gap-3">
          <div className="flex-1">
            <Input
              label="テンプレートNo"
              {...register('templateNo')}
              error={errors.templateNo?.message}
              readOnly
            />
          </div>
          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={() => onPreview(templateNo)}
            disabled={!templateNo}
          >
            プレビュー
          </Button>
        </div>
      </fieldset>

      {/* 点検期間 */}
      <fieldset className="space-y-4">
        <legend className="text-sm font-semibold text-gray-900 mb-2">点検期間</legend>
        <div className="grid grid-cols-2 gap-4">
          <Input
            label="開始日"
            type="date"
            {...register('startDate')}
            error={errors.startDate?.message}
          />
          <Input
            label="終了日"
            type="date"
            {...register('endDate')}
            error={errors.endDate?.message}
          />
        </div>
      </fieldset>

      {/* 表示期間 */}
      <fieldset className="space-y-4">
        <legend className="text-sm font-semibold text-gray-900 mb-2">表示設定</legend>
        <div className="grid grid-cols-2 gap-4">
          <Input
            label="表示開始日"
            type="date"
            {...register('displayStartDate')}
            error={errors.displayStartDate?.message}
          />
          <Input
            label="表示終了日"
            type="date"
            {...register('displayEndDate')}
            error={errors.displayEndDate?.message}
          />
          <Input
            label="表示開始時刻"
            type="time"
            {...register('displayStartTime')}
            error={errors.displayStartTime?.message}
          />
          <Input
            label="表示終了時刻"
            type="time"
            {...register('displayEndTime')}
            error={errors.displayEndTime?.message}
          />
        </div>
        <Input
          label="表示時間（秒）"
          type="number"
          min={1}
          {...register('displayDuration', { valueAsNumber: true })}
          error={errors.displayDuration?.message}
        />
      </fieldset>

      {/* 貼紙・案内文 */}
      <fieldset className="space-y-4">
        <legend className="text-sm font-semibold text-gray-900 mb-2">貼紙・案内文</legend>
        <Select
          label="貼紙区分"
          options={posterTypeOptions}
          {...register('posterType')}
          error={errors.posterType?.message}
        />

        {/* カスタム画像アップロード */}
        {posterType === 'custom' && (
          <div className="space-y-2">
            <label className="block text-sm font-medium text-gray-700">カスタム画像</label>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/png,image/jpeg"
              onChange={handleImageSelected}
              className="block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-md file:border-0 file:text-sm file:font-medium file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100"
            />
            {previewUrl && (
              <div className="relative inline-block">
                <img
                  src={previewUrl}
                  alt="プレビュー"
                  className="max-h-40 rounded border border-gray-200"
                />
                <button
                  type="button"
                  onClick={handleClearImage}
                  className="absolute -top-2 -right-2 bg-red-500 text-white rounded-full w-5 h-5 flex items-center justify-center text-xs"
                >
                  x
                </button>
              </div>
            )}
          </div>
        )}

        <Select
          label="ポスター位置"
          options={posterPositionOptions}
          {...register('posterPosition')}
          error={errors.posterPosition?.message}
        />
        <Input
          label="フレームNo"
          {...register('frameNo')}
          error={errors.frameNo?.message}
        />
        <div className="flex items-center gap-2">
          <input
            type="checkbox"
            id="showOnBoard"
            {...register('showOnBoard')}
            className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
          />
          <label htmlFor="showOnBoard" className="text-sm text-gray-700">
            掲示板に表示する
          </label>
        </div>
        <TextArea
          label="掲示板用案内文"
          rows={3}
          {...register('noticeText')}
          error={errors.noticeText?.message}
        />
        <TextArea
          label="備考"
          rows={2}
          {...register('remarks')}
          error={errors.remarks?.message}
        />
      </fieldset>

      {/* アクション */}
      <div className="flex gap-3 pt-2">
        <Button type="submit" variant="primary">
          {isEditing ? '更新' : '追加'}
        </Button>
        <Button type="button" variant="secondary" onClick={handleReset}>
          リセット
        </Button>
      </div>
    </form>
  );
}
