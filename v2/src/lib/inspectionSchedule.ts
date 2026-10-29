/**
 * 点検の行の3項目（業務システム 修正依頼1026 の src/lib/inspections/schedule-fields.ts と同じ決まり。2026-10-27 修正依頼1027(7)）:
 * - 点検日連絡（notify_inspection_date）: 設備点検管理システムで点検日を連絡（申請）する点検か。既定 ON。
 *   『リモート点検』『警備』を含む種別と『デジタルサイネージ点検』（2026-10-29 修正依頼1029 D3 で追加）は**新しく足すときの既定**が OFF
 *   （点検日の連絡は無く、報告書だけ）。保存済みの行は保存された値のまま
 * - インターバル（interval_months）: 検査の周期（か月）。1〜120。空は未入力（新しく足す行の既定は 12）
 * - 請求月（billing_months）: 月次用の 1〜12。空なら毎月扱い
 */

/** 点検日連絡の既定が OFF になる点検種別の名前（業務システムと同じ判定） */
const NOTIFY_OFF_LABEL = /(リモート点検|警備)|^デジタルサイネージ点検$/;

/** インターバルの既定（か月）。新しく足す行の初期値（保存済みで未入力の行は空のまま・placeholder に出すだけ） */
export const DEFAULT_INTERVAL_MONTHS = 12;
const INTERVAL_MAX = 120;

/** 新しく足す行の点検日連絡の既定。点検種別の名前が『リモート点検』『警備』を含むか『デジタルサイネージ点検』そのものなら OFF */
export function defaultNotifyFor(typeLabel: string | null | undefined): boolean {
  return !NOTIFY_OFF_LABEL.test(typeLabel ?? '');
}

/** インターバルの入力（文字列）→ か月。空は null。整数 1〜120 でなければ error */
export function parseIntervalMonths(raw: string | null | undefined): { value: number | null; error: string | null } {
  const v = (raw ?? '').trim();
  if (v === '') return { value: null, error: null };
  const n = Number(v);
  if (!Number.isInteger(n) || n < 1 || n > INTERVAL_MAX) {
    return { value: null, error: `インターバルは 1〜${INTERVAL_MAX} の整数（か月）で入力してください` };
  }
  return { value: n, error: null };
}

/** 月の並びを重複なしの昇順にする（DB もこの形で持つ） */
export function normalizeMonthList(months: unknown): number[] {
  const list = Array.isArray(months)
    ? months.map(Number).filter((n) => Number.isInteger(n) && n >= 1 && n <= 12)
    : [];
  return [...new Set(list)].sort((a, b) => a - b);
}

/** 請求月の表示。空は「毎月」 */
export function billingMonthsLabel(months: readonly number[] | null | undefined): string {
  const list = normalizeMonthList(months);
  return list.length > 0 ? `${list.join(',')}月` : '毎月';
}

export interface ScheduleValues {
  notify_inspection_date: boolean;
  interval_months: number | null;
  billing_months: number[];
}

type ScheduleFields = Partial<{
  notify_inspection_date: boolean;
  interval_months: number | null;
  billing_months: number[];
}>;

/**
 * 保存で送る3項目。保存済みの行で読めていない（notify が undefined）ものは null（送らない＝今の値を消さない）。
 * 新しい行で触っていない項目は既定（点検日連絡は種別の名前で決める・インターバル 12・請求月は毎月）で埋める
 */
export function scheduleForSave(
  row: ScheduleFields,
  isNew: boolean,
  typeLabel: string | null | undefined,
): ScheduleValues | null {
  if (!isNew && row.notify_inspection_date === undefined) return null;
  return {
    notify_inspection_date: row.notify_inspection_date ?? defaultNotifyFor(typeLabel),
    interval_months:
      row.interval_months === undefined ? (isNew ? DEFAULT_INTERVAL_MONTHS : null) : row.interval_months,
    billing_months: normalizeMonthList(row.billing_months ?? []),
  };
}

/** 比較用の形（3つとも undefined は「読めていない／触っていない」） */
export function scheduleKey(row: ScheduleFields): string {
  if (
    row.notify_inspection_date === undefined &&
    row.interval_months === undefined &&
    row.billing_months === undefined
  ) {
    return '';
  }
  return JSON.stringify([
    row.notify_inspection_date ?? null,
    row.interval_months ?? null,
    normalizeMonthList(row.billing_months ?? []),
  ]);
}
