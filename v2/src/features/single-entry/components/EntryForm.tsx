import { useState, useCallback } from 'react';
import { Input } from '@/components/ui/Input';
import { TextArea } from '@/components/ui/TextArea';
import { Select } from '@/components/ui/Select';
import { Button } from '@/components/ui/Button';
import { useToast } from '@/components/ui/Toast';
import type { MasterData } from '@/types/app';
import { useEntryForm } from '../hooks/useEntryForm';
import { useCascadingSelects } from '../hooks/useCascadingSelects';
import { usePreview } from '../hooks/usePreview';
import { CascadingSelects } from './CascadingSelects';
import { PosterPreview } from './PosterPreview';
import type { EntrySchemaType } from '../schemas/entrySchema';
import type { LocalEntry } from './EntryDataList';

interface EntryFormProps {
  masterData: MasterData;
  onAddEntry: (entry: LocalEntry) => void;
}

export function EntryForm({ masterData, onAddEntry }: EntryFormProps) {
  const { addToast } = useToast();
  const [selectedCategory, setSelectedCategory] = useState('');

  const {
    register,
    handleSubmit,
    setValue,
    getValues,
    watch,
    formState: { errors },
    resetForm,
  } = useEntryForm();

  const cascading = useCascadingSelects({
    masterData,
    setValue,
    getValues,
  });

  const preview = usePreview({ inspectionTypes: masterData.inspectionTypes });

  const watchedPropertyCode = watch('propertyCode');
  const watchedPosterType = watch('posterType');
  const watchedPosterPosition = watch('posterPosition');

  const terminalOptions = cascading.getTerminalOptions(watchedPropertyCode);
  const filteredInspectionTypes = cascading.getInspectionTypesByCategory(selectedCategory);

  const handlePropertyChange = useCallback(
    (code: string) => {
      cascading.handlePropertyChange(code);
    },
    [cascading],
  );

  const handleVendorChange = useCallback(
    (name: string) => {
      cascading.handleVendorChange(name);
    },
    [cascading],
  );

  const handleCategoryChange = useCallback(
    (categoryId: string) => {
      setSelectedCategory(categoryId);
      cascading.handleCategoryChange(categoryId);
    },
    [cascading],
  );

  const handleInspectionTypeChange = useCallback(
    (name: string) => {
      cascading.handleInspectionTypeChange(name);
      preview.setSelectedInspectionName(name);
    },
    [cascading, preview],
  );

  const handlePositionChange = useCallback(
    (position: string) => {
      setValue('posterPosition', position);
      preview.setPosterPosition(position);
    },
    [setValue, preview],
  );

  const onSubmit = (data: EntrySchemaType) => {
    const entry: LocalEntry = {
      ...data,
      _id: crypto.randomUUID(),
    };
    onAddEntry(entry);
    addToast('データを追加しました', 'success');
    resetForm();
    setSelectedCategory('');
    preview.setSelectedInspectionName('');
    preview.setPosterPosition('4');
  };

  const posterTypeOptions = [
    { value: 'template', label: 'テンプレート' },
    { value: 'custom', label: '追加（カスタム）' },
  ];

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
      <CascadingSelects
        register={register}
        errors={errors}
        masterData={masterData}
        selectedPropertyCode={watchedPropertyCode}
        selectedCategory={selectedCategory}
        filteredInspectionTypes={filteredInspectionTypes}
        terminalOptions={terminalOptions}
        onPropertyChange={handlePropertyChange}
        onVendorChange={handleVendorChange}
        onCategoryChange={handleCategoryChange}
        onInspectionTypeChange={handleInspectionTypeChange}
      />

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <Input
          label="点検開始日"
          type="date"
          {...register('startDate')}
          error={errors.startDate?.message}
        />
        <Input
          label="点検完了日"
          type="date"
          {...register('endDate')}
          error={errors.endDate?.message}
        />
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Input
          label="表示開始日"
          type="date"
          {...register('displayStartDate')}
          error={errors.displayStartDate?.message}
        />
        <Input label="表示開始時刻" type="time" {...register('displayStartTime')} />
        <Input
          label="表示終了日"
          type="date"
          {...register('displayEndDate')}
          error={errors.displayEndDate?.message}
        />
        <Input label="表示終了時刻" type="time" {...register('displayEndTime')} />
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <Input
          label="表示時間（秒）"
          type="number"
          min={1}
          {...register('displayDuration', { valueAsNumber: true })}
          error={errors.displayDuration?.message}
        />
        <Select
          label="貼紙区分"
          options={posterTypeOptions}
          {...register('posterType')}
          error={errors.posterType?.message}
        />
        <Input label="テンプレートNo" {...register('templateNo')} readOnly />
      </div>

      <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
        <div className="space-y-4">
          <TextArea
            label="掲示板用案内文"
            rows={3}
            {...register('noticeText')}
            error={errors.noticeText?.message}
          />
          <TextArea
            label="掲示備考"
            rows={2}
            {...register('remarks')}
            error={errors.remarks?.message}
          />
          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id="showOnBoard"
              {...register('showOnBoard')}
              className="h-4 w-4 rounded border-gray-300 text-blue-600"
            />
            <label htmlFor="showOnBoard" className="text-sm text-gray-700">
              掲示板に表示する
            </label>
          </div>
        </div>

        {watchedPosterType === 'template' && (
          <PosterPreview
            templateImageUrl={preview.templateImageUrl}
            posterPosition={watchedPosterPosition}
            onPositionChange={handlePositionChange}
          />
        )}
      </div>

      <div className="flex gap-3">
        <Button type="submit" variant="primary">
          追加
        </Button>
        <Button
          type="button"
          variant="secondary"
          onClick={() => {
            resetForm();
            setSelectedCategory('');
            preview.setSelectedInspectionName('');
            preview.setPosterPosition('4');
          }}
        >
          リセット
        </Button>
      </div>
    </form>
  );
}
