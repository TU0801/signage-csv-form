import type { DbInspectionReport, PortalEntryRow, PortalInspectionRow } from '@/types/portal';
import { reportEntryId } from '@/features/inspection-portal/lib/actions';
import {
  buildSchedule,
  formatMonth,
  latestReport,
  monthOf,
  unscheduledInspections,
} from '@/features/inspection-portal/lib/schedule';

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
): BulkTarget[] {
  const mine = vendorId ? inspections.filter((i) => inspectionOfVendor(i, vendorId)) : inspections;
  const name = (i: PortalInspectionRow) =>
    `${i.property_name}（${i.property_code}）・${i.inspection_type_label ?? '点検'}${vendorId ? '' : `・${i.vendor_name ?? '保守会社未設定'}`}`;
  const scheduled = buildSchedule(mine, entries, reports, { today, monthsAhead })
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
  const unscheduled = unscheduledInspections(mine)
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
 * 提出するとこの区間が置き換える、提出済みの版（無ければ null）。DB の portal_register_report と同じ規則:
 * 提出する保守会社は accountVendorId（ログイン中のアカウントの保守会社＝current_vendor_id()）、無ければ
 * 同じ点検・対象月の最新の版の保守会社、それも無ければ点検行の保守会社。置き換えるのはその保守会社の版だけ
 * （台ごとに別の保守会社が居る点検で、他社の提出は置き換えない）
 */
export function reportToReplace(
  reports: DbInspectionReport[],
  target: BulkTarget,
  performedOn: string,
  accountVendorId: string | null,
): DbInspectionReport | null {
  const month = effectiveTargetMonth(target, performedOn);
  if (!month) return null;
  const latest = latestReport(reports, target.inspection.inspection_id, month);
  if (!latest) return null;
  const vendor = accountVendorId ?? latest.vendor_id ?? target.inspection.vendor_id;
  if (latest.vendor_id === vendor) return latest;
  return latestReport(
    reports.filter((r) => r.vendor_id === vendor),
    target.inspection.inspection_id,
    month,
  );
}

export interface SegmentErrors {
  target?: string;
  performedOn?: string;
}

/**
 * 送信前の確認。点検・実施日の未入力と、同じ点検 × 対象月を2つ以上の区間に割り当てたもの
 * （後に登録した区間が前の区間を置き換えてしまう）を区間ごとに返す
 */
export function validateSegments(
  segments: Segment[],
  inputs: Record<number, SegmentInput>,
  targets: Map<string, BulkTarget>,
  defaultPerformedOn: string,
): Record<number, SegmentErrors> {
  const errors: Record<number, SegmentErrors> = {};
  const used = new Map<string, Segment[]>();
  for (const seg of segments) {
    const input = inputs[seg.start] ?? EMPTY_INPUT;
    const performedOn = effectivePerformedOn(input, defaultPerformedOn);
    const target = targets.get(input.targetKey);
    const e: SegmentErrors = {};
    if (!target) e.target = '点検を選んでください';
    if (!performedOn) e.performedOn = '実施日を入力してください';
    if (target) {
      const month = effectiveTargetMonth(target, performedOn);
      if (month) {
        const k = `${target.inspection.inspection_id}:${month}`;
        used.set(k, [...(used.get(k) ?? []), seg]);
      }
    }
    if (e.target || e.performedOn) errors[seg.start] = e;
  }
  for (const segs of used.values()) {
    if (segs.length < 2) continue;
    const nos = segs.map((s) => `区間${s.no}`).join('・');
    for (const s of segs) {
      errors[s.start] = { ...errors[s.start], target: `同じ点検・対象月が ${nos} に割り当てられています（1つの区間にまとめてください）` };
    }
  }
  return errors;
}
