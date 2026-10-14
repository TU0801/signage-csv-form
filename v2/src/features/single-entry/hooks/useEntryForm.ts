import { useCallback, useState } from 'react';
import { validateImageFile } from '@/lib/storage';
import type { AppSettings } from '@/lib/api/single-entry';
import type { MasterProperty } from '@/types/app';
import type { DbInspectionType } from '@/types/database';
import type { CustomImage, LocalEntry, SingleEntryValues } from '../types';
import {
  applyCategoryChange,
  applyEndDateChange,
  applyInspectionType,
  applyLinkedDefaults,
  applyPropertyChange,
  applyStartDateChange,
  applyVendorCleared,
  duplicateValues,
  initialValues,
  localToday,
  valuesFromEntry,
} from '../lib/entryLogic';

interface UseEntryFormArgs {
  settings: AppSettings;
  properties: MasterProperty[];
  inspectionTypes: DbInspectionType[];
  linkedIds: ReadonlySet<string>;
}

function readAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

/** 1件入力フォームの値と、v1 script.js の各 onchange に当たる操作 */
export function useEntryForm({ settings, properties, inspectionTypes, linkedIds }: UseEntryFormArgs) {
  const [values, setValues] = useState<SingleEntryValues>(() => initialValues(settings, localToday()));
  const [customImage, setCustomImage] = useState<CustomImage | null>(null);

  const setField = useCallback(
    <K extends keyof SingleEntryValues>(key: K, value: SingleEntryValues[K]) =>
      setValues((v) => ({ ...v, [key]: value })),
    [],
  );

  // v1: js/script.js onPropertyChange
  const changeProperty = useCallback(
    (code: string) => setValues((v) => applyPropertyChange(v, code, properties)),
    [properties],
  );

  // v1: js/script.js onCategoryChange
  const changeCategory = useCallback(
    (category: string) => setValues((v) => applyCategoryChange(v, category, inspectionTypes, linkedIds)),
    [inspectionTypes, linkedIds],
  );

  // v1: js/script.js onInspectionTypeChange
  const changeInspectionType = useCallback(
    (id: string) => setValues((v) => applyInspectionType(v, id, inspectionTypes)),
    [inspectionTypes],
  );

  // v1: js/script.js init（startDate / endDate の change）
  const changeStartDate = useCallback((d: string) => setValues((v) => applyStartDateChange(v, d)), []);
  const changeEndDate = useCallback((d: string) => setValues((v) => applyEndDateChange(v, d)), []);

  // v1: js/script.js applyLinkedDefaults
  const applyLinked = useCallback(
    (ids: ReadonlySet<string>) => setValues((v) => applyLinkedDefaults(v, inspectionTypes, ids)),
    [inspectionTypes],
  );

  // v1: js/script.js onAdminVendorChange（選択を外したとき）
  const clearVendor = useCallback(() => setValues((v) => applyVendorCleared(v)), []);

  // v1: js/script.js onAdminVendorChange の末尾（物件・端末を空に）/ populatePropertySelect（消えた物件の選択を外す）
  const resetProperty = useCallback(
    () => setValues((v) => ({ ...v, propertyCode: '', terminalId: '' })),
    [],
  );

  /**
   * 画像を選ぶ。形式（JPG/PNG）と大きさ（5MB 以下）を確かめる。だめならメッセージを返す。
   */
  // v1: js/script.js onImageSelected
  const selectImage = useCallback(async (file: File): Promise<string | null> => {
    try {
      validateImageFile(file);
    } catch (e) {
      return e instanceof Error ? e.message : '画像を選択できませんでした';
    }
    const dataUrl = await readAsDataUrl(file);
    setCustomImage({ file, dataUrl });
    return null;
  }, []);

  // v1: js/script.js clearCustomImage
  const clearImage = useCallback(() => setCustomImage(null), []);

  /** クリア（カテゴリは残す。v1 clearForm と同じ） */
  // v1: js/script.js clearForm
  const clear = useCallback(() => {
    setValues((v) => ({ ...initialValues(settings, localToday()), category: v.category }));
    setCustomImage(null);
  }, [settings]);

  // v1: js/script.js editEntry
  const loadEntry = useCallback(
    (e: LocalEntry) => {
      setValues((v) => valuesFromEntry(v, e, inspectionTypes, linkedIds));
      setCustomImage(e.customImage);
    },
    [inspectionTypes, linkedIds],
  );

  // v1: js/script.js duplicateLastEntry
  const duplicate = useCallback(
    (last: LocalEntry) =>
      setValues((v) => duplicateValues(v, last, { properties, inspectionTypes, linkedIds, settings })),
    [properties, inspectionTypes, linkedIds, settings],
  );

  return {
    values,
    customImage,
    setField,
    changeProperty,
    changeCategory,
    changeInspectionType,
    changeStartDate,
    changeEndDate,
    applyLinked,
    clearVendor,
    resetProperty,
    selectImage,
    clearImage,
    clear,
    loadEntry,
    duplicate,
  };
}

export type EntryFormApi = ReturnType<typeof useEntryForm>;
