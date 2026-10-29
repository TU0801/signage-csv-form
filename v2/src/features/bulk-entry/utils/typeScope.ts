import { normalizePropertyCode } from '@/features/inspection-portal/lib/schedule';
import type { PortalInspectionRow } from '@/types/portal';
import type { BulkEntryRow } from '../types';

/*
 * 点検種別を選び直せる範囲（修正依頼1029 ユーザー決定④）。保守会社は、その物件で自社が担当する点検種別（業務システムの点検行の
 * 保守会社か、台ごとの保守の保守会社）の中からだけ選べる。DB の guard_entry_type_scope（scripts/fix-1029-detail.sql）と同じ考え方
 * （scripts/fix-1029-detail.sql）。
 */

/** 範囲を決める点検行（portal_inspections の一部） */
export type ScopeInspection = Pick<
  PortalInspectionRow,
  'inspection_id' | 'property_code' | 'inspection_type_label' | 'vendor_id' | 'unit_vendor_ids'
>;

/** 保守会社がこの点検行を担当するか（点検行の会社か台の会社）。vendorId が null なら絞らない（DB が自社の分だけ返したもの） */
function ownedBy(i: ScopeInspection, vendorId: string | null): boolean {
  return vendorId === null || i.vendor_id === vendorId || i.unit_vendor_ids.includes(vendorId);
}

/**
 * その物件で保守会社が担当する点検種別（重複なし）。order（点検種別マスターの並び）があればその順、無ければ名前順
 */
export function vendorTypeOptions(
  inspections: readonly ScopeInspection[],
  propertyCode: string,
  vendorId: string | null,
  order: readonly string[] = [],
): string[] {
  const code = normalizePropertyCode(String(propertyCode));
  const labels = new Set(
    inspections
      .filter((i) => normalizePropertyCode(i.property_code) === code && ownedBy(i, vendorId) && i.inspection_type_label)
      .map((i) => i.inspection_type_label!),
  );
  const rank = (l: string) => {
    const n = order.indexOf(l);
    return n === -1 ? Number.MAX_SAFE_INTEGER : n;
  };
  return [...labels].sort((a, b) => rank(a) - rank(b) || a.localeCompare(b, 'ja'));
}

/**
 * 物件 × 点検種別の点検行（保守会社が担当するもの）。点検行の会社であるものを台だけの会社より先に、どちらも無ければ null
 */
export function inspectionForType<T extends ScopeInspection>(
  inspections: readonly T[],
  propertyCode: string,
  label: string,
  vendorId: string | null,
): T | null {
  const code = normalizePropertyCode(String(propertyCode));
  const hits = inspections.filter(
    (i) => normalizePropertyCode(i.property_code) === code && i.inspection_type_label === label && ownedBy(i, vendorId),
  );
  return hits.find((i) => vendorId !== null && i.vendor_id === vendorId) ?? hits[0] ?? null;
}

/** 点検予定の行で点検種別を変えたときの行き先 */
export type RetypeTarget =
  /** 同じ物件・同じ対象月（・同じ台）の、その種別の点検の予定の行へ入力を移す */
  | { kind: 'row'; rowId: number }
  /** その種別の点検にこの月の予定の行が無い（点検月でない・台が違う 等）。手入力の行として足す */
  | { kind: 'manual' }
  | { kind: 'error'; message: string };

/**
 * 点検予定の行（点検に紐付いた行）の点検種別を変えたときの行き先（修正依頼1029）。
 * 予定の行は「点検行 × 対象月（× 台）」に結び付いているので、行の種別だけを変えると紐付けと種別が食い違う。そこで
 * 同じ物件の新しい種別の点検行の、同じ対象月・同じ台の予定の行へ入力を移す。
 * - その行が申請済み・修正中、または入力済みなら移さない（error）
 * - 新しい種別の点検が台ごとの点検で、同じ台の行が無ければ移さない（どの台の申請か決められない）
 * - 予定の行が無ければ手入力の行にする（申請のときに物件・種別・点検開始日の月で点検行に結び付く。予定の月でなければ紐付けない）
 */
export function retypeTarget(
  rows: readonly BulkEntryRow[],
  source: BulkEntryRow,
  newType: string,
  inspections: readonly ScopeInspection[],
): RetypeTarget {
  const schedule = source.schedule;
  if (!schedule) return { kind: 'manual' };
  const code = normalizePropertyCode(String(source.propertyCode));
  const ids = new Set(
    inspections
      .filter((i) => normalizePropertyCode(i.property_code) === code && i.inspection_type_label === newType)
      .map((i) => i.inspection_id),
  );
  const candidates = rows.filter(
    (r) =>
      r.id !== source.id &&
      r.schedule &&
      ids.has(r.schedule.inspectionId) &&
      (r.schedule.targetMonth ?? null) === (schedule.targetMonth ?? null),
  );
  if (candidates.length === 0) return { kind: 'manual' };
  const target = schedule.unitId
    ? candidates.find((r) => r.schedule!.unitId === schedule.unitId)
    : candidates.length === 1
      ? candidates[0]
      : candidates.find((r) => !r.schedule!.unitId);
  if (!target) {
    return {
      kind: 'error',
      message: `「${newType}」は台ごとの点検です。表の「${newType}」の該当する台の行で入力してください`,
    };
  }
  if (target.schedule!.locked || target.schedule!.editEntryId) {
    return { kind: 'error', message: `「${newType}」のこの月の点検は申請済みです。点検種別は変えられません` };
  }
  if (target.startDate || target.remarks || target.memo) {
    return {
      kind: 'error',
      message: `「${newType}」のこの月の行に入力があります。その行を直すか、入力を消してから選び直してください`,
    };
  }
  return { kind: 'row', rowId: target.id };
}

/** 申請済みの申請を修正している行で点検種別を変えたときの付け替え先 */
export type EditRetypeTarget =
  /** その種別の点検（同じ物件・同じ対象月の予定の行がある点検）へ付け替える。台は付け替え先の点検の台（無ければ null） */
  | { kind: 'link'; inspectionId: string; unitId: string | null }
  /** 申請の元の点検の種別に戻した（付け替えない） */
  | { kind: 'own' }
  | { kind: 'error'; message: string };

/**
 * 申請済み（承認前）の申請を修正している行（schedule.editEntryId）の点検種別を変えたときの付け替え先（修正依頼1029 決定④）。
 * 申請は「点検行 × 対象月（× 台）」に結び付いていて、DB（portal_update_submitted_entry）は物件・対象月を変えさせないので、
 * 同じ物件の新しい種別の点検のうち、同じ対象月の予定の行がある点検へ付け替える。予定の行の付け替え（retypeTarget）と同じく
 * - その月の予定の行が無い・同じ種別の点検が2つ以上あって決められないときは止める
 * - 台は申請の台（entryUnitId）が付け替え先の点検にあればその台、無ければ台なし。付け替え先が2台以上の点検で台を決められなければ止める
 * - 付け替え先の行が申請済み・修正中・申請不要、または入力済みなら止める（二重の申請・入力の取り違えにしない）
 */
export function editRetypeTarget(
  rows: readonly BulkEntryRow[],
  source: BulkEntryRow,
  newType: string,
  inspections: readonly ScopeInspection[],
  entryUnitId: string | null,
): EditRetypeTarget {
  const schedule = source.schedule;
  if (!schedule) return { kind: 'error', message: '点検予定の行ではありません' };
  const code = normalizePropertyCode(String(source.propertyCode));
  const own = inspections.find((i) => i.inspection_id === schedule.inspectionId);
  if (own?.inspection_type_label === newType) return { kind: 'own' };
  const ids = new Set(
    inspections
      .filter((i) => normalizePropertyCode(i.property_code) === code && i.inspection_type_label === newType)
      .map((i) => i.inspection_id),
  );
  const candidates = rows.filter(
    (r) =>
      r.id !== source.id &&
      r.schedule &&
      ids.has(r.schedule.inspectionId) &&
      (r.schedule.targetMonth ?? null) === (schedule.targetMonth ?? null),
  );
  if (candidates.length === 0) {
    return {
      kind: 'error',
      message: `「${newType}」の点検にこの月の予定が無いため、点検種別は変えられません（点検月以外の月は「全ての月」で出ます）`,
    };
  }
  if (new Set(candidates.map((r) => r.schedule!.inspectionId)).size > 1) {
    return { kind: 'error', message: `この物件に「${newType}」の点検が2つ以上あり、付け替える点検を決められません` };
  }
  const unitRows = candidates.filter((r) => r.schedule!.unitId);
  const sameUnit = entryUnitId ? candidates.find((r) => r.schedule!.unitId === entryUnitId) : undefined;
  if (!sameUnit && unitRows.length >= 2) {
    return {
      kind: 'error',
      message: `「${newType}」は台ごとの点検で、どの台の申請か決められません。取り下げて「${newType}」の台の行で申請してください`,
    };
  }
  const target = sameUnit ?? candidates[0]!;
  if (target.schedule!.reportOnly) {
    return { kind: 'error', message: `「${newType}」は申請不要の点検です。点検種別は変えられません` };
  }
  if (target.schedule!.locked || target.schedule!.editEntryId) {
    return { kind: 'error', message: `「${newType}」のこの月の点検は申請済みです。点検種別は変えられません` };
  }
  if (target.startDate || target.remarks || target.memo) {
    return {
      kind: 'error',
      message: `「${newType}」のこの月の行に入力があります。その行の入力を消してから選び直してください`,
    };
  }
  return { kind: 'link', inspectionId: target.schedule!.inspectionId, unitId: sameUnit ? entryUnitId : null };
}
