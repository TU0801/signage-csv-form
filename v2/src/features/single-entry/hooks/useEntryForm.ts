import { useCallback, useRef, useState } from 'react';
import { validateImageFile } from '@/lib/storage';
import { todayUtc } from '@/lib/utils';
import type { AppSettings } from '@/lib/api/single-entry';
import type { MasterProperty } from '@/types/app';
import type { DbInspectionType } from '@/types/database';
import type { PortalInspectionRow } from '@/types/portal';
import type { CustomImage, LocalEntry, LocalExtraPoster, SingleEntryValues } from '../types';
import type { PosterLibraryItem } from '@/lib/api/poster-library';
import { MAX_EXTRA_POSTERS, isCompanyLibraryPoster } from '@/lib/extraPosters';
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
  // 2枚目以降の貼紙（修正依頼1025 D3）。テンプレートの貼紙にも足せる
  const [extraPosters, setExtraPosters] = useState<LocalExtraPoster[]>([]);
  // 点検工事案内が自動で入った値（未選択・紐付けの既定・カテゴリで選び直した値・物件の既定）か。手で選んだ値・編集や複製で
  // 読み込んだ値は false。物件を選んだときは、空か自動の値のときだけ物件の点検行の種別に入れ替える（修正依頼1024 本番確認 ②）
  const autoTypeRef = useRef(true);
  // 物件を変えて外した貼紙の知らせ（管理会社の分のライブラリの貼紙。ユーザー決定3）
  const [posterNotice, setPosterNotice] = useState<string | null>(null);

  const setField = useCallback(
    <K extends keyof SingleEntryValues>(key: K, value: SingleEntryValues[K]) =>
      setValues((v) => ({ ...v, [key]: value })),
    [],
  );

  // v1: js/script.js onPropertyChange
  // 点検工事案内が空なら、その物件の点検行の種別（無ければ紐付けの先頭）を入れる（一括入力 B9 と同じ規則）。
  // 自動で入った値は、その物件の点検行があるときだけその種別に入れ替える
  // 管理会社の分のライブラリの貼紙は、その管理会社の物件の申請でだけ使える（ユーザー決定3）。選んだときの物件で絞っているので、
  // 物件を変えたら外して知らせる（全社共通・アップロードは残す）。前回を複製で物件が変わるときも同じ
  const dropCompanyLibraryPosters = useCallback(
    (nextCode: string) => {
      if (nextCode === values.propertyCode) return;
      const dropMain = !!customImage && !customImage.file && isCompanyLibraryPoster(customImage.dataUrl);
      const keptExtras = extraPosters.filter((x) => x.file || !isCompanyLibraryPoster(x.dataUrl));
      const dropped = (dropMain ? 1 : 0) + extraPosters.length - keptExtras.length;
      if (dropMain) setCustomImage(null);
      if (keptExtras.length !== extraPosters.length) setExtraPosters(keptExtras);
      setPosterNotice(
        dropped > 0
          ? `物件を変えたため、管理会社の貼紙ライブラリから選んだ貼紙${dropped}枚を外しました（その管理会社の物件でだけ使えます。必要なら選び直してください）`
          : null,
      );
    },
    [values.propertyCode, customImage, extraPosters],
  );

  const changeProperty = useCallback(
    (code: string) => {
      setValues((v) => {
        const next = applyPropertyChange(v, code, properties);
        if (v.inspectionTypeId && !autoTypeRef.current) return next;
        // 空なら一括入力と同じ (a)→(b)。自動で入った値は物件の点検行があるときだけ入れ替える（紐付けの先頭で上書きしない）
        return applyPropertyInspectionDefault(next, inspectionTypes, inspections, linkedIds, !v.inspectionTypeId);
      });
      dropCompanyLibraryPosters(code);
    },
    [properties, inspectionTypes, inspections, linkedIds, dropCompanyLibraryPosters],
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

  /** 貼紙ライブラリの画像を1枚目の追加の貼紙にする（修正依頼1025 D2。アップロードしない） */
  const selectLibraryImage = useCallback((item: PosterLibraryItem) => {
    setCustomImage({ file: null, dataUrl: item.image_url, libraryId: item.id, name: item.display_name });
  }, []);

  /** 2枚目以降の貼紙をアップロードの画像で足す。形式・大きさがだめならメッセージを返す */
  const addExtraUpload = useCallback(async (file: File): Promise<string | null> => {
    try {
      validateImageFile(file);
    } catch (e) {
      return e instanceof Error ? e.message : '画像を選択できませんでした';
    }
    const dataUrl = await readAsDataUrl(file);
    setExtraPosters((prev) =>
      prev.length >= MAX_EXTRA_POSTERS ? prev : [...prev, { file, dataUrl, name: file.name, position: null }],
    );
    return null;
  }, []);

  /** 2枚目以降の貼紙をライブラリの画像で足す */
  const addExtraLibrary = useCallback((item: PosterLibraryItem) => {
    setExtraPosters((prev) =>
      prev.length >= MAX_EXTRA_POSTERS
        ? prev
        : [...prev, { file: null, dataUrl: item.image_url, libraryId: item.id, name: item.display_name, position: null }],
    );
  }, []);

  const removeExtra = useCallback((index: number) => setExtraPosters((prev) => prev.filter((_, i) => i !== index)), []);

  const setExtraPosition = useCallback(
    (index: number, position: string | null) =>
      setExtraPosters((prev) => prev.map((x, i) => (i === index ? { ...x, position } : x))),
    [],
  );

  /** クリア（カテゴリは残す。v1 clearForm と同じ） */
  // v1: js/script.js clearForm
  const clear = useCallback(() => {
    autoTypeRef.current = true;
    setValues((v) => ({ ...initialValues(settings, todayUtc()), category: v.category }));
    setCustomImage(null);
    setExtraPosters([]);
    setPosterNotice(null);
  }, [settings]);

  // v1: js/script.js editEntry
  const loadEntry = useCallback(
    (e: LocalEntry) => {
      autoTypeRef.current = false;
      setValues((v) => valuesFromEntry(v, e, inspectionTypes, linkedIds));
      setCustomImage(e.customImage);
      setExtraPosters(e.extraPosters ?? []);
      setPosterNotice(null);
    },
    [inspectionTypes, linkedIds],
  );

  // v1: js/script.js duplicateLastEntry
  const duplicate = useCallback(
    (last: LocalEntry) => {
      autoTypeRef.current = false;
      setValues((v) => duplicateValues(v, last, { properties, inspectionTypes, linkedIds, settings }));
      dropCompanyLibraryPosters(last.propertyCode || '');
    },
    [properties, inspectionTypes, linkedIds, settings, dropCompanyLibraryPosters],
  );

  return {
    values,
    customImage,
    extraPosters,
    posterNotice,
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
    selectLibraryImage,
    addExtraUpload,
    addExtraLibrary,
    removeExtra,
    setExtraPosition,
    clear,
    loadEntry,
    duplicate,
  };
}

export type EntryFormApi = ReturnType<typeof useEntryForm>;
