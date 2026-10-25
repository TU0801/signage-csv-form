import { EntryStatus, PosterType } from '@/lib/constants';
import type { AppSettings, EntryInsertRow } from '@/lib/api/single-entry';
import type { MasterProperty } from '@/types/app';
import type { DbInspectionType, DbVendor, Terminal } from '@/types/database';
import type { RpcPropertyManagementCompanyRow } from '@/types/rpc';
import { followEndDate } from '@/lib/inspectionDates';
import { customImageName, type CustomImage, type LocalEntry, type LocalExtraPoster, type SingleEntryValues } from '../types';
import type { ExtraPoster } from '@/lib/extraPosters';
import {
  inspectionsOfVendor,
  matchInspectionLink,
  type InspectionLink,
} from '@/features/inspection-portal/lib/inspectionLink';
import { normalizePropertyCode } from '@/features/inspection-portal/lib/schedule';
import type { PortalInspectionRow } from '@/types/portal';

/** 案内カテゴリの選択肢（v1 index.html #inspectionCategory。'' = 全て） */
export const CATEGORY_OPTIONS = ['点検', '工事', '清掃', 'その他', 'アンケート'] as const;

/** 表示位置の選択肢（v1 index.html displayPosition。既定は ②上中） */
export const POSITION_OPTIONS = [
  { value: 1, label: '①上左' },
  { value: 2, label: '②上中' },
  { value: 3, label: '③上右' },
  { value: 4, label: '④中央' },
  { value: 0, label: '⓪全体' },
] as const;

export const DEFAULT_FRAME_NO = 2;

/** フォームの初期値（v1 script.js init / clearForm） */
export function initialValues(settings: AppSettings, today: string): SingleEntryValues {
  return {
    propertyCode: '',
    terminalId: '',
    category: '',
    inspectionTypeId: '',
    posterType: PosterType.TEMPLATE,
    noticeText: '',
    templateNo: '',
    startDate: today,
    // 点検終了日は点検開始日と同じ日を既定にする（B10。編集できる）
    endDate: today,
    remarks: '',
    memo: '',
    displayStartDate: today,
    displayStartTime: '',
    // 表示終了日は点検終了日に追従する（applyStartDateChange・applyEndDateChange と同じ）
    displayEndDate: today,
    displayEndTime: '',
    displayTime: String(settings.display_time_default),
    frameNo: DEFAULT_FRAME_NO,
  };
}

/** 端末のある物件か */
export function hasTerminal(p: Pick<MasterProperty, 'terminals'>): boolean {
  return p.terminals.some((t) => !!t.terminal_id);
}

/** 端末の無い物件の選択肢に添える印（未設置物件も入力はできる。印は見分けるためだけ） */
export const NO_TERMINAL_HINT = '端末なし';

/**
 * 物件の選択肢。物件コードの数値昇順（数値にならなければ文字列昇順）。
 * 「サイネージ設置物件のみ」ON のときは端末のある物件だけ（v1 82aa0fb。既定 OFF で未設置物件も出す）。
 */
// v1: js/script.js populatePropertySelect
export function buildPropertyOptions(
  properties: MasterProperty[],
  signageOnly: boolean,
): { value: string; label: string; hint?: string }[] {
  const sorted = [...properties].sort((a, b) => {
    const na = parseInt(a.property_code, 10);
    const nb = parseInt(b.property_code, 10);
    if (!Number.isNaN(na) && !Number.isNaN(nb)) return na - nb;
    return String(a.property_code).localeCompare(String(b.property_code));
  });
  const seen = new Set<string>();
  const options: { value: string; label: string; hint?: string }[] = [];
  sorted.forEach((p) => {
    const withTerminal = hasTerminal(p);
    if (signageOnly && !withTerminal) return;
    if (seen.has(p.property_code)) return;
    seen.add(p.property_code);
    const label = `${p.property_code} ${p.property_name}`;
    options.push(withTerminal ? { value: p.property_code, label } : { value: p.property_code, label, hint: NO_TERMINAL_HINT });
  });
  return options;
}

/**
 * 「点検月のみ」（修正依頼1025 D5。既定）で物件の候補に残す物件コード。保守会社の点検行のうち、
 * 点検月にその月（今月）を含むもの・点検月が未登録のもの・毎月の点検種別のものがある物件。
 * 物件コードの書式の揺れ（120410 と 120410-00）は吸収する（normalizePropertyCode と同じ）
 */
export function inspectionMonthPropertyCodes(
  inspections: { property_code: string; inspection_type_id: string; inspection_months: number[] }[],
  month: number,
  monthlyTypeIds: ReadonlySet<string> = new Set(),
): Set<string> {
  const codes = new Set<string>();
  inspections.forEach((i) => {
    if (i.inspection_months.length === 0 || i.inspection_months.includes(month) || monthlyTypeIds.has(i.inspection_type_id)) {
      codes.add(i.property_code.trim().replace(/-00$/, ''));
    }
  });
  return codes;
}

/** 物件が「点検月のみ」の候補に入るか（inspectionMonthPropertyCodes の結果で判定） */
export function inInspectionMonth(codes: ReadonlySet<string>, propertyCode: string): boolean {
  return codes.has(propertyCode.trim().replace(/-00$/, ''));
}

/** 管理会社フィルターの「未設定」の値（'' = 全て、それ以外は会社 ID） */
export const MANAGEMENT_COMPANY_NONE = '__none__';

/** 物件コード → 管理会社 ID（未設定は null）と、選択肢にする管理会社（社名順） */
export interface ManagementCompanyIndex {
  byCode: Map<string, string | null>;
  companies: { id: string; name: string }[];
}

export function buildManagementCompanyIndex(rows: RpcPropertyManagementCompanyRow[]): ManagementCompanyIndex {
  const byCode = new Map<string, string | null>();
  const names = new Map<string, string>();
  rows.forEach((r) => {
    byCode.set(r.property_code, r.management_company_id);
    if (r.management_company_id) names.set(r.management_company_id, r.management_company_name ?? '');
  });
  const companies = [...names].map(([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name, 'ja'));
  return { byCode, companies };
}

/**
 * 管理会社で物件を絞る。'' は全て。業務システムに結び付いていない物件は「未設定」に入れる。
 */
export function filterByManagementCompany<T extends Pick<MasterProperty, 'property_code'>>(
  properties: T[],
  index: ManagementCompanyIndex | null,
  companyId: string,
): T[] {
  if (!companyId || !index) return properties;
  const want = companyId === MANAGEMENT_COMPANY_NONE ? null : companyId;
  return properties.filter((p) => (index.byCode.get(p.property_code) ?? null) === want);
}

/** 物件の端末（空の端末は選択肢にしない） */
// v1: js/script.js onPropertyChange
export function terminalsOf(properties: MasterProperty[], propertyCode: string): Terminal[] {
  if (!propertyCode) return [];
  const p = properties.find((x) => String(x.property_code) === String(propertyCode));
  return (p?.terminals ?? []).filter((t) => !!t.terminal_id);
}

/** 物件を選んだときの値（端末は先頭を選ぶ。無ければ空） */
// v1: js/script.js onPropertyChange
export function applyPropertyChange(
  values: SingleEntryValues,
  propertyCode: string,
  properties: MasterProperty[],
): SingleEntryValues {
  const terminals = terminalsOf(properties, propertyCode);
  return { ...values, propertyCode, terminalId: terminals[0]?.terminal_id ?? '' };
}

/**
 * 点検工事案内の選択肢。カテゴリは実カテゴリ列で完全一致（列が空の項目は名前の部分一致）。
 * 紐付け済みの点検種別を上に（安定ソートでマスターの並びは保つ）。
 */
// v1: js/script.js populateInspectionTypeSelect
export function filterInspectionTypes(
  types: DbInspectionType[],
  category: string,
  linkedIds: ReadonlySet<string>,
): DbInspectionType[] {
  const list = types.filter(
    (t) => !category || (t.category ? t.category === category : t.inspection_name.includes(category)),
  );
  if (linkedIds.size > 0) {
    list.sort((a, b) => (linkedIds.has(a.id) ? 0 : 1) - (linkedIds.has(b.id) ? 0 : 1));
  }
  return list;
}

/**
 * 選択を決める。今の選択が選択肢に残っていれば保つ。紐付けがあるときは先頭を選ぶ。それ以外は未選択。
 */
// v1: js/script.js populateInspectionTypeSelect（選択状態の決定）
export function chooseInspectionTypeId(
  currentId: string,
  ordered: DbInspectionType[],
  linkedIds: ReadonlySet<string>,
): string {
  if (currentId && ordered.some((t) => t.id === currentId)) return currentId;
  if (linkedIds.size > 0 && ordered.length > 0) return ordered[0]!.id;
  return '';
}

/** 点検種別の既定の案内文（未選択・見つからなければ ''） */
export function defaultNoticeText(types: DbInspectionType[], inspectionTypeId: string): string {
  if (!inspectionTypeId) return '';
  return types.find((x) => x.id === inspectionTypeId)?.default_text || '';
}

/**
 * 点検種別を選んだときの値（テンプレートNo を差し替え、案内文は既定文にする）。
 * 点検種別が変わらないとき（カテゴリを変えても今の種別が残るときなど）は、手で書き換えた案内文を残す。
 * v1 は毎回上書きしていたため、カテゴリを触るだけで書いた案内文が消えていた。
 * 種別が変わるときは既定文に差し替える（前の種別の文が新しい種別のまま申請されないように）。
 */
// v1: js/script.js onInspectionTypeChange
export function applyInspectionType(
  values: SingleEntryValues,
  inspectionTypeId: string,
  types: DbInspectionType[],
): SingleEntryValues {
  const t = inspectionTypeId ? types.find((x) => x.id === inspectionTypeId) : undefined;
  if (!t) return { ...values, inspectionTypeId, templateNo: '' };
  const edited =
    inspectionTypeId === values.inspectionTypeId &&
    values.noticeText !== '' &&
    values.noticeText !== defaultNoticeText(types, values.inspectionTypeId);
  return {
    ...values,
    inspectionTypeId,
    noticeText: edited ? values.noticeText : t.default_text || '',
    templateNo: t.template_no || '',
  };
}

/**
 * 物件を選んだときの点検工事案内（修正依頼1024 本番確認 ②。一括入力の defaultInspectionType（B9）と同じ規則）。
 * (a) その物件×保守会社の点検行の点検種別（点検種別マスターの並びで先頭）→ 無ければ (b) 保守会社に紐付けた点検種別の先頭。
 * どちらも無ければ値はそのまま。選んだ種別が今のカテゴリの選択肢に無ければカテゴリを「全て」にする（欄が空に見えないように）。
 * 物件コードは 120410 と 120410-00 を同じに見る（点検行への結び付けと同じ）。入れてよいか（空か自動で入った値か）は呼び出し側で決める。
 * fallbackToLinked=false のときは (b) を使わない（自動で入った値を入れ替えるのは点検行があるときだけ。カテゴリで選び直した値を
 * 紐付けの先頭で上書きしないため）
 */
export function applyPropertyInspectionDefault(
  values: SingleEntryValues,
  types: DbInspectionType[],
  inspections: Pick<PortalInspectionRow, 'property_code' | 'inspection_type_label'>[],
  linkedIds: ReadonlySet<string>,
  fallbackToLinked = true,
): SingleEntryValues {
  if (!values.propertyCode) return values;
  const code = normalizePropertyCode(String(values.propertyCode));
  const labels = new Set(
    inspections
      .filter((i) => i.inspection_type_label && normalizePropertyCode(i.property_code) === code)
      .map((i) => i.inspection_type_label),
  );
  const t =
    types.find((x) => labels.has(x.inspection_name)) ??
    (fallbackToLinked ? types.find((x) => linkedIds.has(x.id)) : undefined);
  if (!t) return values;
  const visible = filterInspectionTypes(types, values.category, linkedIds).some((x) => x.id === t.id);
  return applyInspectionType({ ...values, category: visible ? values.category : '' }, t.id, types);
}

/** カテゴリを変えたとき（選び直してから点検種別の反映をやり直す） */
// v1: js/script.js onCategoryChange
export function applyCategoryChange(
  values: SingleEntryValues,
  category: string,
  types: DbInspectionType[],
  linkedIds: ReadonlySet<string>,
): SingleEntryValues {
  const ordered = filterInspectionTypes(types, category, linkedIds);
  const id = chooseInspectionTypeId(values.inspectionTypeId, ordered, linkedIds);
  return applyInspectionType({ ...values, category }, id, types);
}

/**
 * 紐付けがすべて同じ1カテゴリで、そのカテゴリが選択肢にあるときだけ、そのカテゴリを返す。
 * 未分類（null）が混じる・選択肢に無いカテゴリなら null（「全て」のまま）。
 */
// v1: js/script.js applyLinkedDefaults（カテゴリの初期選択）
export function linkedDefaultCategory(
  types: DbInspectionType[],
  linkedIds: ReadonlySet<string>,
): string | null {
  const cats = new Set(types.filter((t) => linkedIds.has(t.id)).map((t) => t.category || '(none)'));
  if (cats.size !== 1) return null;
  const only = [...cats][0]!;
  return (CATEGORY_OPTIONS as readonly string[]).includes(only) ? only : null;
}

/** 紐付けを読み込んだあとの初期表示（カテゴリ → 点検種別の順に反映） */
// v1: js/script.js applyLinkedDefaults
export function applyLinkedDefaults(
  values: SingleEntryValues,
  types: DbInspectionType[],
  linkedIds: ReadonlySet<string>,
): SingleEntryValues {
  const category = linkedDefaultCategory(types, linkedIds) ?? values.category;
  return applyCategoryChange(values, category, types, linkedIds);
}

/** 管理者が保守会社の選択を外したとき（紐付けなし・カテゴリ全て・点検種別未選択） */
// v1: js/script.js onAdminVendorChange（vendorId が空の分岐）
export function applyVendorCleared(values: SingleEntryValues): SingleEntryValues {
  return { ...values, category: '', inspectionTypeId: '', templateNo: '' };
}

/**
 * 点検開始日を変えたとき: 表示開始日は常に追従。終了日は followEndDate の規則（空・旧開始日と同じ・新開始日より前なら
 * 新開始日。修正依頼1024 B10）で、変わったときは表示終了日も同じ日に
 */
// v1: js/script.js init（startDate の change。v1 は終了日が空のときだけ追従）
export function applyStartDateChange(values: SingleEntryValues, startDate: string): SingleEntryValues {
  const next = { ...values, startDate, displayStartDate: startDate };
  const endDate = followEndDate(values.startDate, values.endDate, startDate);
  if (endDate !== values.endDate) {
    next.endDate = endDate;
    next.displayEndDate = endDate;
  }
  return next;
}

/** 点検終了日を変えたとき: 表示終了日は常に追従 */
// v1: js/script.js init（endDate の change）
export function applyEndDateChange(values: SingleEntryValues, endDate: string): SingleEntryValues {
  return { ...values, endDate, displayEndDate: endDate };
}

/** フォーム外の文脈（どの保守会社として入力するか、どの物件・点検種別があるか） */
export interface EntryContext {
  properties: MasterProperty[];
  inspectionTypes: DbInspectionType[];
  vendor: Pick<DbVendor, 'vendor_name' | 'emergency_contact'> | null;
  customImage: CustomImage | null;
  /** 2枚目以降の貼紙（修正依頼1025 D3） */
  extraPosters?: LocalExtraPoster[];
  hasTemplateImage: (templateNo: string) => boolean;
  settings: AppSettings;
  /** 点検行に結び付けるときの保守会社（useVendorContext の linkVendorId） */
  linkVendorId?: string | null;
  /** 管理者か（保守会社が無いときの知らせを分ける。省略時は管理者の文言） */
  isAdmin?: boolean;
}

export type BuildEntryResult =
  | { ok: true; entry: Omit<LocalEntry, '_id'> }
  /** settingsTab: 表示設定タブの項目（表示時間・表示日）の誤りを含む。画面はそのタブを開いて見せる */
  | { ok: false; message: string; settingsTab?: true };

/**
 * 入力を検査して手元のデータを作る。メッセージは v1 と同じ文言・同じ順番。
 * 保守会社が決まっていないときは追加しない（v1 は隠し欄 '0' で先頭の保守会社になっていた。不具合候補として報告）。
 */
// v1: js/script.js addEntry
export function buildLocalEntry(values: SingleEntryValues, ctx: EntryContext): BuildEntryResult {
  const { startDate, endDate } = values;
  const isCustom = values.posterType === PosterType.CUSTOM;

  if (startDate && endDate && startDate > endDate) {
    return { ok: false, message: '終了日は開始日より後にしてください' };
  }
  // v1 は「必須項目を入力してください」。ここで止まるのは物件だけなので欄の名前を出す
  if (!values.propertyCode) return { ok: false, message: '物件コードを選択してください' };
  if (!ctx.vendor) {
    // 保守会社のアカウントには保守会社の選択欄が無いので、選ぶよう促さずに管理者への連絡を促す（修正依頼1024 本番確認 ③）
    return {
      ok: false,
      message: ctx.isAdmin === false
        ? 'アカウントに保守会社が設定されていません。管理者に連絡してください'
        : '保守会社を選択してください',
    };
  }

  const inspection = ctx.inspectionTypes.find((t) => t.id === values.inspectionTypeId);
  if (isCustom) {
    if (!ctx.customImage) return { ok: false, message: '貼紙画像を選択してください' };
    // 追加の貼紙でも点検工事案内は必須（点検行への結び付けに使う。選び忘れると点検予定に結び付かない。修正依頼1024 本番確認 ②）
    if (!inspection) return { ok: false, message: '点検工事案内を選択してください' };
  } else {
    if (!inspection) return { ok: false, message: '点検工事案内を選択してください' };
    if (!ctx.hasTemplateImage(values.templateNo)) {
      return { ok: false, message: '選択された点検種別のテンプレート画像が見つかりません' };
    }
  }

  const s = ctx.settings;
  const errors: string[] = [];
  let settingsTab = false;
  const displayTime = parseInt(values.displayTime, 10) || s.display_time_default;
  if (displayTime > s.display_time_max) {
    errors.push(`表示時間は${s.display_time_max}秒以下にしてください`);
    settingsTab = true;
  }
  if (values.remarks) {
    const lines = values.remarks.split('\n');
    if (lines.length > s.remarks_max_lines) {
      errors.push(`掲示備考は${s.remarks_max_lines}行以下にしてください`);
    }
    if (lines.some((line) => line.length > s.remarks_chars_per_line)) {
      errors.push(`掲示備考は1行${s.remarks_chars_per_line}文字以下にしてください`);
    }
  }
  if (values.noticeText && values.noticeText.length > s.notice_text_max_chars) {
    errors.push(`案内文は${s.notice_text_max_chars}文字以下にしてください`);
  }
  if (values.displayStartDate && values.displayEndDate && values.displayStartDate > values.displayEndDate) {
    errors.push('表示終了日は開始日以降にしてください');
    settingsTab = true;
  }
  if (errors.length > 0) {
    const message = errors.join('\n');
    return settingsTab ? { ok: false, message, settingsTab: true } : { ok: false, message };
  }

  const property = ctx.properties.find((p) => String(p.property_code) === String(values.propertyCode));
  return {
    ok: true,
    entry: {
      // 端末未設置の物件は ''（v1: terminalId || property.terminalId）
      terminalId: values.terminalId || terminalsOf(ctx.properties, values.propertyCode)[0]?.terminal_id || '',
      // 英数字コード（z0023A01 等）もあるため数値化しない（v1 8f7c1f6）
      propertyCode: values.propertyCode,
      propertyName: property?.property_name ?? '',
      vendorName: ctx.vendor.vendor_name,
      emergencyContact: ctx.vendor.emergency_contact || '',
      inspectionType: isCustom ? '追加画像' : inspection!.inspection_name,
      templateNo: isCustom ? customImageName(ctx.customImage!) : values.templateNo,
      startDate: values.startDate,
      endDate: values.endDate,
      remarks: values.remarks,
      memo: values.memo,
      noticeText: values.noticeText,
      frameNo: values.frameNo,
      displayStartDate: values.displayStartDate,
      displayEndDate: values.displayEndDate,
      displayStartTime: values.displayStartTime,
      displayEndTime: values.displayEndTime,
      displayTime,
      posterType: values.posterType,
      customImage: isCustom ? ctx.customImage : null,
      extraPosters: ctx.extraPosters ?? [],
      linkVendorId: ctx.linkVendorId ?? null,
      ...(isCustom ? { linkInspectionType: inspection!.inspection_name } : {}),
    },
  };
}

/** 入力中の文字数・行数（案内文・作業時間及び備考の欄の下に出す。検査そのものは buildLocalEntry） */
export function noticeUsage(text: string, settings: AppSettings): { chars: number; max: number; over: boolean } {
  return { chars: text.length, max: settings.notice_text_max_chars, over: text.length > settings.notice_text_max_chars };
}

export function remarksUsage(
  text: string,
  settings: AppSettings,
): { lines: number; maxLines: number; longest: number; perLine: number; over: boolean } {
  const lines = text ? text.split('\n') : [];
  const longest = lines.reduce((m, l) => Math.max(m, l.length), 0);
  const maxLines = settings.remarks_max_lines;
  const perLine = settings.remarks_chars_per_line;
  return { lines: lines.length, maxLines, longest, perLine, over: lines.length > maxLines || longest > perLine };
}

/**
 * 手元のデータを編集のためにフォームへ戻す（v1 editEntry）。
 * v1 は貼紙区分のラジオだけ戻して画像を戻さなかったため、追加画像の行を編集すると更新できなかった（不具合候補）。
 * v2 は画像も戻す。点検種別が今のカテゴリの選択肢に無ければカテゴリを「全て」にする。
 */
// v1: js/script.js editEntry
export function valuesFromEntry(
  values: SingleEntryValues,
  e: LocalEntry,
  types: DbInspectionType[],
  linkedIds: ReadonlySet<string>,
): SingleEntryValues {
  // 追加の貼紙は「追加画像」で記録するので、フォームで選んでいた点検工事案内（点検行への結び付けに使う）を戻す
  const typeName = e.posterType === PosterType.CUSTOM ? (e.linkInspectionType ?? e.inspectionType) : e.inspectionType;
  const t = typeName ? types.find((x) => x.inspection_name === typeName) : undefined;
  const inspectionTypeId = t?.id ?? '';
  const visible = filterInspectionTypes(types, values.category, linkedIds).some((x) => x.id === inspectionTypeId);
  return {
    ...values,
    propertyCode: e.propertyCode,
    terminalId: e.terminalId,
    category: inspectionTypeId && !visible ? '' : values.category,
    inspectionTypeId,
    templateNo: e.templateNo,
    startDate: e.startDate,
    endDate: e.endDate,
    remarks: e.remarks,
    memo: e.memo ?? '',
    noticeText: e.noticeText,
    displayStartDate: e.displayStartDate,
    displayEndDate: e.displayEndDate,
    displayStartTime: e.displayStartTime,
    displayEndTime: e.displayEndTime,
    displayTime: String(e.displayTime),
    frameNo: e.frameNo,
    posterType: e.posterType,
  };
}

/**
 * 前回のデータを複製する。物件・端末・点検種別・案内文・点検日・備考・表示時間だけ写す
 * （表示日・貼紙区分・位置は写さない。カテゴリは「全て」に戻る）。
 */
// v1: js/script.js duplicateLastEntry
export function duplicateValues(
  values: SingleEntryValues,
  last: LocalEntry,
  ctx: { properties: MasterProperty[]; inspectionTypes: DbInspectionType[]; linkedIds: ReadonlySet<string>; settings: AppSettings },
): SingleEntryValues {
  let next = applyPropertyChange(values, last.propertyCode || '', ctx.properties);
  next = { ...next, terminalId: last.terminalId || '' };
  next = applyCategoryChange(next, '', ctx.inspectionTypes, ctx.linkedIds);
  const t = ctx.inspectionTypes.find((x) => x.inspection_name === last.inspectionType);
  if (t) next = applyInspectionType(next, t.id, ctx.inspectionTypes);
  return {
    ...next,
    noticeText: last.noticeText || '',
    startDate: last.startDate || '',
    endDate: last.endDate || '',
    remarks: last.remarks || '',
    memo: last.memo || '',
    displayTime: String(last.displayTime || ctx.settings.display_time_default),
  };
}

/**
 * 申請で INSERT する行を作る（画像は先にアップロードして URL を渡す）。
 * 既定値: 表示開始日=今日、表示終了日=点検終了日、表示時間=設定の既定値、位置=② 。
 */
// v1: js/script.js submitEntries（supabaseEntries の組み立て）
export function toInsertRow(
  e: LocalEntry,
  posterImageUrl: string | null,
  userId: string,
  settings: AppSettings,
  today: string,
  link: InspectionLink | null = null,
  extraPosters: ExtraPoster[] = [],
): EntryInsertRow {
  return {
    user_id: userId,
    property_code: String(e.propertyCode),
    terminal_id: e.terminalId || '',
    vendor_name: e.vendorName,
    emergency_contact: e.emergencyContact || '',
    inspection_type: e.inspectionType,
    template_no: e.templateNo || '',
    inspection_start: e.startDate || null,
    inspection_end: e.endDate || null,
    remarks: e.remarks || '',
    // メモは CSV に出さない（申請の行にだけ残す）
    memo: e.memo || null,
    announcement: e.noticeText || '',
    display_start_date: e.displayStartDate || today,
    display_start_time: e.displayStartTime || null,
    display_end_date: e.displayEndDate || e.endDate || null,
    display_end_time: e.displayEndTime || null,
    display_duration: e.displayTime || settings.display_time_default,
    poster_type: e.posterType === PosterType.TEMPLATE ? PosterType.TEMPLATE : PosterType.CUSTOM,
    poster_image: posterImageUrl,
    poster_position: String(e.frameNo ?? DEFAULT_FRAME_NO),
    status: EntryStatus.DRAFT,
    // 2枚目以降の貼紙（修正依頼1025 D3。画像は先にアップロードして URL にしたもの）。無ければ送らない（DB の既定は []）
    ...(extraPosters.length > 0 ? { extra_posters: extraPosters } : {}),
    // 保守会社の点検行に一致したときだけ（entryInspectionLink）。一致しなければ今までどおり入れない
    ...(link ?? {}),
  };
}

/**
 * 申請を保守会社の点検行（portal_inspections）に結び付ける（修正依頼1024 後続。一括入力の手で足した行と同じ照合）。
 * 保守会社は追加した時点のもの（古い作成データは fallbackVendorId＝申請時の保守会社）。管理者は選んだ保守会社の点検行だけを見る
 */
export function entryInspectionLink(
  e: Pick<LocalEntry, 'propertyCode' | 'inspectionType' | 'startDate' | 'linkVendorId' | 'posterType' | 'linkInspectionType'>,
  inspections: PortalInspectionRow[],
  isAdmin: boolean,
  fallbackVendorId: string | null,
): InspectionLink | null {
  const vendorId = e.linkVendorId === undefined ? fallbackVendorId : e.linkVendorId;
  // 追加の貼紙は inspection_type が「追加画像」に固定されるので、フォームで選んでいた点検工事案内で照合する。選んでいなければ結び付けない
  // （linkInspectionType の無い古い作成データは今までどおり inspectionType）
  const inspectionType = e.posterType === PosterType.CUSTOM ? (e.linkInspectionType ?? e.inspectionType) : e.inspectionType;
  if (!inspectionType) return null;
  return matchInspectionLink(
    { propertyCode: e.propertyCode, inspectionType, startDate: e.startDate },
    inspectionsOfVendor(inspections, isAdmin, vendorId),
    vendorId,
  );
}

const WEEKDAYS = ['日', '月', '火', '水', '木', '金', '土'];

function parseYmd(s: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (!m) return null;
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return Number.isNaN(d.getTime()) ? null : d;
}

/** 張紙に重ねる日付（例 10月15日(木)〜10月16日(金)） */
// v1: js/script.js updatePreview（dateText）
export function formatPosterDate(startDate: string, endDate: string): string {
  const sd = parseYmd(startDate);
  if (!sd) return '';
  let text = `${sd.getMonth() + 1}月${sd.getDate()}日(${WEEKDAYS[sd.getDay()]})`;
  if (endDate && endDate !== startDate) {
    const ed = parseYmd(endDate);
    if (ed) text += `〜${ed.getMonth() + 1}月${ed.getDate()}日(${WEEKDAYS[ed.getDay()]})`;
  }
  return text;
}

/**
 * プレビューの大きさ。画像の縦横比を保ち、幅は親の幅、高さは画面の 60% まで。
 * 文字の大きさは幅（--pw）から CSS で計算する（v1 4737efb: container-type をやめて JS で合わせる）。
 */
// v1: js/script.js updatePreview（fitContainer）
export function computePosterSize(
  naturalWidth: number,
  naturalHeight: number,
  parentWidth: number,
  maxHeight: number,
): { width: number; height: number } | null {
  if (!naturalWidth || !naturalHeight) return null;
  const ratio = naturalWidth / naturalHeight;
  const heightFromWidth = parentWidth / ratio;
  if (heightFromWidth > maxHeight) return { width: maxHeight * ratio, height: maxHeight };
  return { width: parentWidth, height: heightFromWidth };
}

/** 申請済み一覧のステータス表示 */
// v1: js/script.js renderDataList（statusBadge）
// 差し戻された申請（pending＋理由）は点検一覧と同じく「差戻し」と呼ぶ（「未申請」だと理由のある戻しと見分けられない）
export function submittedStatusLabel(
  status: string | null,
  reviewComment?: string | null,
): { label: string; variant: 'warning' | 'success' | 'primary' | 'danger' } {
  if (status === EntryStatus.PENDING && reviewComment?.trim()) return { label: '差戻し', variant: 'danger' };
  if (status === EntryStatus.PENDING) return { label: '未申請', variant: 'warning' };
  if (status === EntryStatus.READY || status === EntryStatus.EXPORTED) return { label: '承認済み', variant: 'success' };
  return { label: '申請済み', variant: 'primary' };
}

/** 登録日時（YYYY/MM/DD HH:MM） */
// v1: js/script.js formatDateTime
export function formatRegisteredAt(dateString: string | null): string {
  if (!dateString) return '-';
  const d = new Date(dateString);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}/${p(d.getMonth() + 1)}/${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}
