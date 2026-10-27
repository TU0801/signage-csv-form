import type { DbInspectionReport, PortalEntryRow, PortalInspectionRow } from '@/types/portal';
import { reportEntryId } from '@/features/inspection-portal/lib/actions';
import {
  buildSchedule,
  formatMonth,
  monthOf,
  unscheduledInspections,
  type InspectionTypeFlags,
} from '@/features/inspection-portal/lib/schedule';
import { unitLabel, unitsForVendor, type UnitIndex } from '@/features/inspection-portal/lib/units';

/*
 * 報告書一括アップロード（1つの PDF を区間に分けて点検ごとに登録する）の、画面に依らない計算。
 * 区切りは「そのページの前で切る」ページ番号（0 始まり、1〜ページ数-1）の集合で持つ。
 */

export interface Segment {
  /** 先頭ページ（0 始まり）。区間の割り当てはこの番号で持つ（後ろで区切りを足し外ししても前の区間の入力が残る） */
  start: number;
  /** 末尾ページ（0 始まり、含む） */
  end: number;
  /** 画面の区間番号（1 始まり） */
  no: number;
}

export function buildSegments(pageCount: number, breaks: ReadonlySet<number>): Segment[] {
  if (pageCount <= 0) return [];
  const cuts = [...breaks].filter((b) => b > 0 && b < pageCount).sort((a, b) => a - b);
  const starts = [0, ...cuts];
  return starts.map((start, i) => ({
    start,
    end: (starts[i + 1] ?? pageCount) - 1,
    no: i + 1,
  }));
}

export function toggleBreak(breaks: ReadonlySet<number>, before: number): Set<number> {
  const next = new Set(breaks);
  if (next.has(before)) next.delete(before);
  else next.add(before);
  return next;
}

/** 「p.1」「p.2-4」 */
export function pageLabel(segment: Pick<Segment, 'start' | 'end'>): string {
  return segment.start === segment.end ? `p.${segment.start + 1}` : `p.${segment.start + 1}-${segment.end + 1}`;
}

/** 区間に割り当てられる点検（点検行 × 対象月）。点検月の無い点検行は対象月 null（実施日の月になる） */
export interface BulkTarget {
  key: string;
  inspection: PortalInspectionRow;
  targetMonth: string | null;
  /** 紐付ける申請（点検一覧の『報告書』と同じ規則） */
  entryId: string | null;
  /** 選択肢の見出し（optgroup）。対象月、または「点検月未登録」 */
  group: string;
  label: string;
}

export const UNSCHEDULED_GROUP = '点検月未登録（対象月は実施日の月）';

/** 保守会社の点検行か（点検一覧の保守会社フィルターと同じ: 先頭の台の会社か、ほかの台の会社） */
export function inspectionOfVendor(inspection: PortalInspectionRow, vendorId: string): boolean {
  return inspection.vendor_id === vendorId || inspection.unit_vendor_ids.includes(vendorId);
}

/** 選択肢の追加の材料（修正依頼1025 form: 点検種別の印と号機） */
export interface BuildTargetsOptions {
  /** 点検種別の印。毎月の点検種別は毎月の選択肢を出す（申請不要の点検種別もそのまま選べる） */
  flags?: ReadonlyMap<string, InspectionTypeFlags>;
  /** 号機。台が2台以上の点検は、報告書は1台目の行の分（点検 × 対象月で1枚）なので、選択肢は1つで台の No を添える */
  units?: UnitIndex;
}

/**
 * 選択肢を作る。点検月のある点検行は予定（今月から monthsAhead か月先まで・過去は点検行の登録月から）、
 * 点検月の無い点検行は1つずつ。並びは対象月の新しい順、最後に点検月未登録。
 * vendorId が null（管理者が保守会社を選んでいない）なら全社の点検で、見出しに保守会社名を付ける
 */
export function buildTargets(
  inspections: PortalInspectionRow[],
  entries: PortalEntryRow[],
  reports: DbInspectionReport[],
  vendorId: string | null,
  today: string,
  monthsAhead = 3,
  { flags, units }: BuildTargetsOptions = {},
): BulkTarget[] {
  const mine = vendorId ? inspections.filter((i) => inspectionOfVendor(i, vendorId)) : inspections;
  // 台の No（2台以上なら「No1・No2」、1台なら No1）。点検行の設備会社固有コードは出さない（物件名とコードで足りる）
  const unitSuffix = (i: PortalInspectionRow) => {
    if (!units) return '';
    const list = unitsForVendor(units, i, vendorId);
    return list.length > 1 ? `（${list.map((u, n) => unitLabel(u, n + 1)).join('・')}）` : '';
  };
  const name = (i: PortalInspectionRow) =>
    `${i.property_name}（${i.property_code}）・${i.inspection_type_label ?? '点検'}${unitSuffix(i)}${vendorId ? '' : `・${i.vendor_name ?? '保守会社未設定'}`}`;
  const scheduled = buildSchedule(mine, entries, reports, { today, monthsAhead, flags })
    .sort((a, b) => b.targetMonth.localeCompare(a.targetMonth))
    .map<BulkTarget>((item) => ({
      key: item.key,
      inspection: item.inspection,
      targetMonth: item.targetMonth,
      entryId: reportEntryId(item),
      group: formatMonth(item.targetMonth),
      // 閉じた選択欄でも対象月が分かるように、見出しだけでなく選択肢にも月を入れる
      label: `${formatMonth(item.targetMonth)}・${name(item.inspection)}`,
    }));
  const unscheduled = unscheduledInspections(mine, flags)
    .slice()
    .sort(
      (a, b) =>
        a.property_code.localeCompare(b.property_code) ||
        (a.inspection_type_label ?? '').localeCompare(b.inspection_type_label ?? ''),
    )
    .map<BulkTarget>((inspection) => ({
      key: `${inspection.inspection_id}:none`,
      inspection,
      targetMonth: null,
      entryId: null,
      group: UNSCHEDULED_GROUP,
      label: `${name(inspection)}（点検月未登録）`,
    }));
  return [...scheduled, ...unscheduled];
}

export interface SegmentInput {
  targetKey: string;
  /** 空なら全区間共通の実施日 */
  performedOn: string;
  note: string;
}

export const EMPTY_INPUT: SegmentInput = { targetKey: '', performedOn: '', note: '' };

/** 区間の実施日（区間の入力が空なら共通の既定値） */
export function effectivePerformedOn(input: SegmentInput, defaultPerformedOn: string): string {
  return input.performedOn || defaultPerformedOn;
}

/** 報告書の対象月（点検月の無い点検行は実施日の月。DB の portal_register_report と同じ） */
export function effectiveTargetMonth(target: BulkTarget, performedOn: string): string | null {
  return target.targetMonth ?? (performedOn ? monthOf(performedOn) : null);
}

/**
 * 同じ点検・対象月に提出済みの版（提出・受領・差戻し。保守会社を問わず新しい順）。報告書は置き換えずに追加するので
 * （修正依頼1027 決定①）、区間に「提出済みの報告書があります（追加します）」と出すために使う
 */
export function existingReports(reports: DbInspectionReport[], target: BulkTarget, performedOn: string): DbInspectionReport[] {
  const month = effectiveTargetMonth(target, performedOn);
  if (!month) return [];
  return reports
    .filter(
      (r) =>
        r.property_inspection_id === target.inspection.inspection_id &&
        r.target_month === month &&
        (r.status === 'submitted' || r.status === 'accepted' || r.status === 'returned'),
    )
    .sort((a, b) => b.created_at.localeCompare(a.created_at));
}

/** 同じ点検に出ている、同じ内容（SHA-256 が同じ）の報告書（削除済みは数えない。新しい順）。1件ずつの提出と一括で共有する */
export function identicalReports(
  reports: DbInspectionReport[],
  inspectionId: string,
  contentHash: string,
): DbInspectionReport[] {
  return reports
    .filter((r) => r.property_inspection_id === inspectionId && r.content_hash === contentHash && r.status !== 'deleted')
    .sort((a, b) => b.created_at.localeCompare(a.created_at));
}

/**
 * 一括アップロードで送らずに済ませる、同じ内容の報告書（無ければ null）。同じ点検のどの対象月でも、
 * 提出中か受領済みの版だけを数える（差戻しの版と同じ PDF を出し直すのは、差戻しへの返事なので送る）。
 * 同じ対象月の版があればそれを優先する
 */
export function identicalLiveReport(
  reports: DbInspectionReport[],
  inspectionId: string,
  targetMonth: string | null,
  contentHash: string,
): DbInspectionReport | null {
  const live = identicalReports(reports, inspectionId, contentHash).filter(
    (r) => r.status === 'submitted' || r.status === 'accepted',
  );
  return live.find((r) => r.target_month === targetMonth) ?? live[0] ?? null;
}

export interface SegmentErrors {
  target?: string;
  performedOn?: string;
}

/** 送信前の確認。点検・実施日の未入力を区間ごとに返す */
export function validateSegments(
  segments: Segment[],
  inputs: Record<number, SegmentInput>,
  targets: Map<string, BulkTarget>,
  defaultPerformedOn: string,
): Record<number, SegmentErrors> {
  const errors: Record<number, SegmentErrors> = {};
  for (const seg of segments) {
    const input = inputs[seg.start] ?? EMPTY_INPUT;
    const performedOn = effectivePerformedOn(input, defaultPerformedOn);
    const e: SegmentErrors = {};
    if (!targets.get(input.targetKey)) e.target = '点検を選んでください';
    if (!performedOn) e.performedOn = '実施日を入力してください';
    if (e.target || e.performedOn) errors[seg.start] = e;
  }
  return errors;
}

/**
 * 同じ点検 × 対象月を2つ以上の区間に割り当てた区間への注意（区間の先頭ページ → 文言）。
 * 報告書は1つの点検 × 対象月に複数持てるので止めない（修正依頼1027 決定①）。取り違えに気づけるよう知らせるだけ
 */
export function sharedTargetNotes(
  segments: Segment[],
  inputs: Record<number, SegmentInput>,
  targets: Map<string, BulkTarget>,
  defaultPerformedOn: string,
): Record<number, string> {
  const used = new Map<string, Segment[]>();
  for (const seg of segments) {
    const input = inputs[seg.start] ?? EMPTY_INPUT;
    const target = targets.get(input.targetKey);
    const month = target ? effectiveTargetMonth(target, effectivePerformedOn(input, defaultPerformedOn)) : null;
    if (!target || !month) continue;
    const k = `${target.inspection.inspection_id}:${month}`;
    used.set(k, [...(used.get(k) ?? []), seg]);
  }
  const notes: Record<number, string> = {};
  for (const segs of used.values()) {
    if (segs.length < 2) continue;
    const nos = segs.map((s) => `区間${s.no}`).join('・');
    for (const s of segs) notes[s.start] = `同じ点検・対象月が ${nos} に割り当てられています（どれも別の報告書として登録されます）`;
  }
  return notes;
}
