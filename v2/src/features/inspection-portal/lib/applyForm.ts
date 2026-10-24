import { EntryStatus, PosterType } from '@/lib/constants';
import type { AppSettings, EntryInsertRow } from '@/lib/api/single-entry';
import type { MasterProperty } from '@/types/app';
import type { DbEntry, DbInspectionType, DbVendor } from '@/types/database';
import type { PortalInspectionRow } from '@/types/portal';
import { buildLocalEntry, DEFAULT_FRAME_NO, toInsertRow } from '@/features/single-entry/lib/entryLogic';
import type { SingleEntryValues } from '@/features/single-entry/types';
import { monthOf } from './schedule';

/*
 * 点検ポータルの申請（ApplyModal）。物件・点検種別・保守会社・テンプレートNo は点検行から決め、
 * 入力チェックと INSERT 行の組み立ては 1件入力（entryLogic の buildLocalEntry・toInsertRow）をそのまま使う
 * （文言・上限を 1件入力と揃えるため）。
 */

/** 申請フォームで入力する値 */
export interface ApplyValues {
  /** 何月分の点検か（YYYY-MM-01） */
  targetMonth: string;
  terminalId: string;
  startDate: string;
  endDate: string;
  noticeText: string;
  remarks: string;
  displayStartDate: string;
  displayEndDate: string;
}

/** フォームの外から決まるもの（点検行・マスタ・設定） */
export interface ApplyContext {
  inspection: PortalInspectionRow;
  /** 物件マスタ（端末を引く）。保守会社の担当物件に無い物件は null */
  property: MasterProperty | null;
  /** 点検種別マスタ（案内文の既定文・テンプレートNo）。見つからなければ null */
  inspectionType: DbInspectionType | null;
  /** 申請する保守会社（受注先）。管理者は点検行の保守会社、保守会社のアカウントは自社 */
  vendor: Pick<DbVendor, 'id' | 'vendor_name' | 'emergency_contact'> | null;
  hasTemplateImage: (templateNo: string) => boolean;
  settings: AppSettings;
}

/** 物件の端末（空の端末は除く） */
export function terminalOptions(property: MasterProperty | null): string[] {
  return (property?.terminals ?? []).map((t) => t.terminal_id).filter((id): id is string => !!id);
}

/** 点検種別（マスタの id が biz の点検種別と同じ。無ければ名前で引く） */
export function findInspectionType(types: DbInspectionType[], inspection: PortalInspectionRow): DbInspectionType | null {
  return (
    types.find((t) => t.id === inspection.inspection_type_id) ??
    types.find((t) => t.inspection_name === (inspection.inspection_type_label ?? '')) ??
    null
  );
}

/**
 * 新しい申請の初期値。点検開始日は空（点検日は保守会社が決めるため既定を置かない）。
 * 端末は先頭、案内文は点検種別の既定文
 */
export function initialApplyValues(targetMonth: string, ctx: Pick<ApplyContext, 'property' | 'inspectionType'>): ApplyValues {
  return {
    targetMonth,
    terminalId: terminalOptions(ctx.property)[0] ?? '',
    startDate: '',
    endDate: '',
    noticeText: ctx.inspectionType?.default_text ?? '',
    remarks: '',
    displayStartDate: '',
    displayEndDate: '',
  };
}

/** 差戻された申請を直すときの初期値（今の申請の値） */
export function valuesFromDbEntry(entry: DbEntry, fallbackMonth: string): ApplyValues {
  return {
    targetMonth: entry.target_month ?? fallbackMonth,
    terminalId: entry.terminal_id ?? '',
    startDate: entry.inspection_start ?? '',
    // 終了日を省いた申請は開始日と同じ日で保存される（buildApplyRow）。そのまま読むと開始日だけ後ろへ直したときに
    // 「終了日は開始日より後に」で止まるので、1日の点検は終了日を空に戻す（保存時にまた開始日が入る）
    endDate: entry.inspection_end && entry.inspection_end !== entry.inspection_start ? entry.inspection_end : '',
    noticeText: entry.announcement ?? '',
    remarks: entry.remarks ?? '',
    displayStartDate: entry.display_start_date ?? '',
    displayEndDate: entry.display_end_date ?? '',
  };
}

/** 点検開始日を変えたとき: 表示開始日は追従、終了日が空なら表示終了日も同じ日（1件入力と同じ） */
export function withStartDate(v: ApplyValues, startDate: string): ApplyValues {
  const next = { ...v, startDate, displayStartDate: startDate };
  if (!v.endDate) next.displayEndDate = startDate;
  return next;
}

/** 点検終了日を変えたとき: 表示終了日は追従（空にしたら開始日に戻す） */
export function withEndDate(v: ApplyValues, endDate: string): ApplyValues {
  return { ...v, endDate, displayEndDate: endDate || v.startDate };
}

/** 点検開始日が対象月の外か（警告だけ。月をまたぐ点検や前倒しもあるので止めない） */
export function startOutsideTargetMonth(v: Pick<ApplyValues, 'startDate' | 'targetMonth'>): boolean {
  return !!v.startDate && !!v.targetMonth && monthOf(v.startDate) !== v.targetMonth;
}

export type BuildApplyResult = { ok: true; row: EntryInsertRow } | { ok: false; message: string };

/**
 * 入力を検査して INSERT 行を作る。検査は 1件入力の buildLocalEntry（文言・上限が同じ）に、
 * 点検開始日の必須と対象月の確認だけを足す。終了日を省いたときは1日の点検として開始日を入れる
 * （1件入力も開始日を入れると終了日が同じ日になる）
 */
export function buildApplyRow(v: ApplyValues, ctx: ApplyContext, userId: string, today: string): BuildApplyResult {
  if (!v.targetMonth) return { ok: false, message: '対象月を選択してください' };
  if (!v.startDate) return { ok: false, message: '点検開始日を入力してください' };
  if (!ctx.vendor) return { ok: false, message: '保守会社が決まっていません（点検に保守会社を登録してください）' };

  const { inspection } = ctx;
  const type: DbInspectionType = ctx.inspectionType ?? {
    // マスタに無い点検種別でも、点検行の名前・テンプレートNo で申請できるようにする
    id: inspection.inspection_type_id,
    inspection_name: inspection.inspection_type_label ?? '',
    template_no: inspection.template_no ?? '',
    template_image: null,
    default_text: null,
    category_id: null,
    category: null,
    show_on_board: null,
    sort_order: null,
    created_at: null,
  };
  const property: MasterProperty = ctx.property ?? {
    id: '',
    property_code: inspection.property_code,
    property_name: inspection.property_name,
    terminals: [],
    inspections: [],
  };
  const endDate = v.endDate || v.startDate;
  const values: SingleEntryValues = {
    propertyCode: inspection.property_code,
    terminalId: v.terminalId,
    category: '',
    inspectionTypeId: type.id,
    posterType: PosterType.TEMPLATE,
    noticeText: v.noticeText,
    templateNo: inspection.template_no || type.template_no || '',
    startDate: v.startDate,
    endDate,
    remarks: v.remarks,
    // 申請のモーダルにメモ欄は無い（メモは点検登録フォームから）
    memo: '',
    displayStartDate: v.displayStartDate || v.startDate,
    displayStartTime: '',
    displayEndDate: v.displayEndDate || endDate,
    displayEndTime: '',
    displayTime: String(ctx.settings.display_time_default),
    frameNo: DEFAULT_FRAME_NO,
  };
  const result = buildLocalEntry(values, {
    properties: [property],
    inspectionTypes: [type],
    vendor: ctx.vendor,
    customImage: null,
    hasTemplateImage: ctx.hasTemplateImage,
    settings: ctx.settings,
  });
  if (!result.ok) return { ok: false, message: result.message };

  // 物件名は点検行の名前（マスタに無い物件でも空にしない）。端末は 0台の物件なら ''（buildLocalEntry が決める）
  const entry = { ...result.entry, _id: '', propertyName: inspection.property_name };
  return {
    ok: true,
    row: {
      ...toInsertRow(entry, null, userId, ctx.settings, today),
      status: EntryStatus.DRAFT,
      property_inspection_id: inspection.inspection_id,
      vendor_id: ctx.vendor!.id,
      target_month: v.targetMonth,
    },
  };
}

/** 差戻しの再申請で UPDATE する列（作成者は変えない） */
export type ResubmitPatch = Omit<EntryInsertRow, 'user_id'>;

export function toResubmitPatch(row: EntryInsertRow): ResubmitPatch {
  const patch: Partial<EntryInsertRow> = { ...row };
  delete patch.user_id;
  // 再申請のモーダルにはメモ欄が無いので、点検登録フォームで書いたメモを消さない
  delete patch.memo;
  return patch as ResubmitPatch;
}
