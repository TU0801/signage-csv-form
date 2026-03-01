import type { UseFormReturn } from 'react-hook-form';
import { Select } from '@/components/ui/Select';
import { Input } from '@/components/ui/Input';
import type { EntryFormData } from '@/types/app';
import type { DbProperty, DbInspectionType, DbVendor } from '@/types/database';
import type { Terminal } from '@/types/database';

interface CascadingSelectsProps {
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
}

export function CascadingSelects({
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
}: CascadingSelectsProps) {
  const {
    register,
    formState: { errors },
    watch,
  } = form;

  const propertyCode = watch('propertyCode');

  const propertyOptions = properties.map((p) => ({
    value: p.property_code,
    label: `${p.property_code} - ${p.property_name}`,
  }));

  const terminalOptions = terminals.map((t) => ({
    value: t.id,
    label: t.supplement ? `${t.id} (${t.supplement})` : t.id,
  }));

  const vendorOptions = vendors.map((v) => ({
    value: v.vendor_name,
    label: v.vendor_name,
  }));

  const inspectionTypeOptions = filteredInspectionTypes.map((t) => ({
    value: t.inspection_name,
    label: t.inspection_name,
  }));

  return (
    <div className="space-y-4">
      {/* 物件選択 */}
      <Select
        label="物件"
        placeholder="物件を選択..."
        options={propertyOptions}
        error={errors.propertyCode?.message}
        {...register('propertyCode')}
        onChange={(e) => onPropertyChange(e.target.value)}
      />

      {/* 端末ID選択 */}
      <Select
        label="端末ID"
        placeholder="端末IDを選択..."
        options={terminalOptions}
        error={errors.terminalId?.message}
        disabled={!propertyCode}
        {...register('terminalId')}
      />

      {/* 保守会社選択 */}
      <Select
        label="保守会社"
        placeholder="保守会社を選択..."
        options={vendorOptions}
        error={errors.vendorName?.message}
        {...register('vendorName')}
        onChange={(e) => onVendorChange(e.target.value)}
      />

      {/* 緊急連絡先（自動入力） */}
      <Input
        label="緊急連絡先"
        {...register('emergencyContact')}
        error={errors.emergencyContact?.message}
      />

      {/* カテゴリ選択 */}
      <Select
        label="カテゴリ"
        placeholder="全カテゴリ"
        options={categoryOptions}
        value={selectedCategoryId}
        onChange={(e) => onCategoryChange(e.target.value)}
      />

      {/* 点検種別選択 */}
      <Select
        label="点検種別"
        placeholder="点検種別を選択..."
        options={inspectionTypeOptions}
        error={errors.inspectionType?.message}
        {...register('inspectionType')}
        onChange={(e) => onInspectionTypeChange(e.target.value)}
      />
    </div>
  );
}
