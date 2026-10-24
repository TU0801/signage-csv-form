import { useCallback, useRef, useState } from 'react';
import { validateImageFile } from '@/lib/storage';
import { todayUtc } from '@/lib/utils';
import type { AppSettings } from '@/lib/api/single-entry';
import type { MasterProperty } from '@/types/app';
import type { DbInspectionType } from '@/types/database';
import type { PortalInspectionRow } from '@/types/portal';
import type { CustomImage, LocalEntry, SingleEntryValues } from '../types';
import {
  applyCategoryChange,
  applyEndDateChange,
  applyInspectionType,
  applyLinkedDefaults,
  applyPropertyChange,
  applyPropertyInspectionDefault,
  applyStartDateChange,
  applyVendorCleared,
  duplicateValues,
  initialValues,
  valuesFromEntry,
} from '../lib/entryLogic';

interface UseEntryFormArgs {
  settings: AppSettings;
  properties: MasterProperty[];
  inspectionTypes: DbInspectionType[];
  linkedIds: ReadonlySet<string>;
  /** 保守会社の点検行（物件を選んだときの点検工事案内の既定に使う。読めなければ空） */
  inspections?: Pick<PortalInspectionRow, 'property_code' | 'inspection_type_label'>[];
}

const NO_INSPECTIONS: Pick<PortalInspectionRow, 'property_code' | 'inspection_type_label'>[] = [];

function readAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

/** 1件入力フォームの値と、v1 script.js の各 onchange に当たる操作 */
export function useEntryForm({
  settings,
  properties,
  inspectionTypes,
  linkedIds,
  inspections = NO_INSPECTIONS,
}: UseEntryFormArgs) {
  const [values, setValues] = useState<SingleEntryValues>(() => initialValues(settings, todayUtc()));
  const [customImage, setCustomImage] = useState<CustomImage | null>(null);
  // 点検工事案内が自動で入った値（未選択・紐付けの既定・カテゴリで選び直した値・物件の既定）か。手で選んだ値・編集や複製で
  // 読み込んだ値は false。物件を選んだときは、空か自動の値のときだけ物件の点検行の種別に入れ替える（修正依頼1024 本番確認 ②）
  const autoTypeRef = useRef(true);

  const setField = useCallback(
    <K extends keyof SingleEntryValues>(key: K, value: SingleEntryValues[K]) =>
      setValues((v) => ({ ...v, [key]: value })),
    [],
  );

  // v1: js/script.js onPropertyChange
  // 点検工事案内が空なら、その物件の点検行の種別（無ければ紐付けの先頭）を入れる（一括入力 B9 と同じ規則）。
  // 自動で入った値は、その物件の点検行があるときだけその種別に入れ替える
  const changeProperty = useCallback(
    (code: string) =>
      setValues((v) => {
        const next = applyPropertyChange(v, code, properties);
        if (v.inspectionTypeId && !autoTypeRef.current) return next;
        // 空なら一括入力と同じ (a)→(b)。自動で入った値は物件の点検行があるときだけ入れ替える（紐付けの先頭で上書きしない）
        return applyPropertyInspectionDefault(next, inspectionTypes, inspections, linkedIds, !v.inspectionTypeId);
      }),
    [properties, inspectionTypes, inspections, linkedIds],
  );

  // v1: js/script.js onCategoryChange
  const changeCategory = useCallback(
    (category: string) =>
      setValues((v) => {
        const next = applyCategoryChange(v, category, inspectionTypes, linkedIds);
        // 今の種別が選択肢から外れて選び直したときは自動の値
        if (next.inspectionTypeId !== v.inspectionTypeId) autoTypeRef.current = true;
        return next;
      }),
    [inspectionTypes, linkedIds],
  );

  // v1: js/script.js onInspectionTypeChange
  const changeInspectionType = useCallback(
    (id: string) => {
      autoTypeRef.current = !id;
      setValues((v) => applyInspectionType(v, id, inspectionTypes));
    },
    [inspectionTypes],
  );

  // v1: js/script.js init（startDate / endDate の change）
  const changeStartDate = useCallback((d: string) => setValues((v) => applyStartDateChange(v, d)), []);
  const changeEndDate = useCallback((d: string) => setValues((v) => applyEndDateChange(v, d)), []);

  // v1: js/script.js applyLinkedDefaults
  const applyLinked = useCallback(
    (ids: ReadonlySet<string>) => {
      autoTypeRef.current = true;
      setValues((v) => applyLinkedDefaults(v, inspectionTypes, ids));
    },
    [inspectionTypes],
  );

  // v1: js/script.js onAdminVendorChange（選択を外したとき）
  const clearVendor = useCallback(() => {
    autoTypeRef.current = true;
    setValues((v) => applyVendorCleared(v));
  }, []);

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
    autoTypeRef.current = true;
    setValues((v) => ({ ...initialValues(settings, todayUtc()), category: v.category }));
    setCustomImage(null);
  }, [settings]);

  // v1: js/script.js editEntry
  const loadEntry = useCallback(
    (e: LocalEntry) => {
      autoTypeRef.current = false;
      setValues((v) => valuesFromEntry(v, e, inspectionTypes, linkedIds));
      setCustomImage(e.customImage);
    },
    [inspectionTypes, linkedIds],
  );

  // v1: js/script.js duplicateLastEntry
  const duplicate = useCallback(
    (last: LocalEntry) => {
      autoTypeRef.current = false;
      setValues((v) => duplicateValues(v, last, { properties, inspectionTypes, linkedIds, settings }));
    },
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
