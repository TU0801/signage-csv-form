import { useCallback, useMemo, useState } from 'react';
import type { UseFormSetValue } from 'react-hook-form';
import type { EntryFormData } from '@/types/app';
import type { DbProperty, DbVendor, DbInspectionType, DbCategory } from '@/types/database';

interface UseCascadingSelectsArgs {
  setValue: UseFormSetValue<EntryFormData>;
  properties: DbProperty[];
  vendors: DbVendor[];
  inspectionTypes: DbInspectionType[];
  categories: DbCategory[];
}

export function useCascadingSelects({
  setValue,
  properties,
  vendors,
  inspectionTypes,
  categories,
}: UseCascadingSelectsArgs) {
  const [selectedCategoryId, setSelectedCategoryId] = useState<string>('');

  /** 物件選択時: terminals[0].id を terminalId にセット */
  const handlePropertyChange = useCallback(
    (propertyCode: string) => {
      setValue('propertyCode', propertyCode);
      const property = properties.find((p) => p.property_code === propertyCode);
      if (property?.terminals?.length) {
        setValue('terminalId', property.terminals[0]!.id);
      } else {
        setValue('terminalId', '');
      }
    },
    [properties, setValue],
  );

  /** 保守会社選択時: emergency_contact を emergencyContact にセット */
  const handleVendorChange = useCallback(
    (vendorName: string) => {
      setValue('vendorName', vendorName);
      const vendor = vendors.find((v) => v.vendor_name === vendorName);
      setValue('emergencyContact', vendor?.emergency_contact ?? '');
    },
    [vendors, setValue],
  );

  /** カテゴリ選択時: inspectionTypes をフィルタ */
  const handleCategoryChange = useCallback(
    (categoryId: string) => {
      setSelectedCategoryId(categoryId);
      // カテゴリ変更時に点検種別をリセット
      setValue('inspectionType', '');
      setValue('templateNo', '');
      setValue('noticeText', '');
      setValue('frameNo', '1');
      setValue('showOnBoard', true);
    },
    [setValue],
  );

  /** 点検種別選択時: 関連フィールドを自動設定 */
  const handleInspectionTypeChange = useCallback(
    (inspectionName: string) => {
      setValue('inspectionType', inspectionName);
      const inspType = inspectionTypes.find((t) => t.inspection_name === inspectionName);
      if (inspType) {
        setValue('templateNo', inspType.template_no ?? '');
        setValue('noticeText', inspType.default_text ?? '');
        setValue('frameNo', '1');
        setValue('showOnBoard', inspType.show_on_board ?? true);
      }
    },
    [inspectionTypes, setValue],
  );

  /** 選択中の物件の端末一覧 */
  const getTerminals = useCallback(
    (propertyCode: string) => {
      const property = properties.find((p) => p.property_code === propertyCode);
      return property?.terminals ?? [];
    },
    [properties],
  );

  /** フィルタ済み点検種別 */
  const filteredInspectionTypes = useMemo(() => {
    if (!selectedCategoryId) return inspectionTypes;
    return inspectionTypes.filter((t) => t.category_id === selectedCategoryId);
  }, [inspectionTypes, selectedCategoryId]);

  /** カテゴリ選択肢 */
  const categoryOptions = useMemo(
    () => categories.map((c) => ({ value: c.id, label: c.category_name })),
    [categories],
  );

  return {
    selectedCategoryId,
    filteredInspectionTypes,
    categoryOptions,
    handlePropertyChange,
    handleVendorChange,
    handleCategoryChange,
    handleInspectionTypeChange,
    getTerminals,
  };
}
