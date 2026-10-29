import type { DbInspectionReport, PortalInspectionRow } from '@/types/portal';
import { monthOf } from '@/features/inspection-portal/lib/schedule';
import { buildSegments, inspectionOfVendor, type Segment } from './bulkSegments';
import { MAX_PROPERTY_FILE_BYTES, propertyFileMime } from './propertyFiles';
import type { UploadCategory } from './fileNameExtract';

/*
 * ファイルのアップロード（修正依頼1029(1)）の表の計算。画面に依らない純関数だけを置く。
 * 1行 = 1区間（PDF はページの間で区切った区間、ほかの形式は1ファイル1行）。区分が報告書の行は点検（物件 × 点検種別 × 対象月）に
 * 結び付けて報告書として、それ以外はその他ファイル（物件のファイル）として登録する。
 */

export type SourceKind = 'pdf' | 'image' | 'video' | 'office';

export function sourceKindOf(name: string): SourceKind | null {
  const mime = propertyFileMime(name);
  if (!mime) return null;
  if (mime === 'application/pdf') return 'pdf';
  if (mime.startsWith('image/')) return 'image';
  if (mime.startsWith('video/')) return 'video';
  return 'office';
}

/** 追加したファイル1つ */
export interface UploadSource {
  id: string;
  file: File;
  kind: SourceKind;
  /** PDF のページ数（PDF 以外は 0） */
  pageCount: number;
  /** 区切り（そのページの前で切る。0 始まり） */
  breaks: ReadonlySet<number>;
  /** 削除したページ（空白ページなど。送る PDF から外す） */
  removed: ReadonlySet<number>;
}

/** 表の1行（区間） */
export interface UploadRow {
  /** 入力を持つ鍵（PDF は「ファイル:区間の先頭ページ」。後ろで区切りを足し外ししても前の区間の入力が残る） */
  key: string;
  sourceId: string;
  /** PDF の区間（PDF 以外は null） */
  segment: Segment | null;
  /** 送るページ（削除したページを除く。PDF 以外は空） */
  pages: number[];
  /** 表の通し番号（1 始まり） */
  no: number;
}

export function rowKey(sourceId: string, start: number | null): string {
  return start === null ? sourceId : `${sourceId}:${start}`;
}

/** ファイルの並び順に区間を並べる（PDF は区間ごと、ほかは1行） */
export function buildRows(sources: UploadSource[]): UploadRow[] {
  const rows: UploadRow[] = [];
  for (const s of sources) {
    if (s.kind !== 'pdf') {
      rows.push({ key: rowKey(s.id, null), sourceId: s.id, segment: null, pages: [], no: rows.length + 1 });
      continue;
    }
    for (const seg of buildSegments(s.pageCount, s.breaks)) {
      const pages: number[] = [];
      for (let p = seg.start; p <= seg.end; p++) if (!s.removed.has(p)) pages.push(p);
      rows.push({ key: rowKey(s.id, seg.start), sourceId: s.id, segment: seg, pages, no: rows.length + 1 });
    }
  }
  return rows;
}

/** 「p.1」「p.2-4」、削除したページがあれば「p.2-4（1ページ削除）」 */
export function rowPageLabel(row: UploadRow): string {
  if (!row.segment) return '—';
  const { start, end } = row.segment;
  const base = start === end ? `p.${start + 1}` : `p.${start + 1}-${end + 1}`;
  const removed = end - start + 1 - row.pages.length;
  return removed > 0 ? `${base}（${removed}ページ削除）` : base;
}

/** 行の入力（区分〜保守会社）。空文字は未入力 */
export interface RowInput {
  category: UploadCategory | '';
  /** 区分「その他」の内容 */
  categoryNote: string;
  /** 実施日（点検開始日。その他ファイルは作業実施日） */
  performedOn: string;
  propertyCode: string;
  inspectionType: string;
  /** 対象月（YYYY-MM。空なら実施日の月） */
  targetMonth: string;
  note: string;
  managementCompanyId: string;
  vendorId: string;
}

export type RowField = keyof RowInput;

export const EMPTY_ROW_INPUT: RowInput = {
  category: '',
  categoryNote: '',
  performedOn: '',
  propertyCode: '',
  inspectionType: '',
  targetMonth: '',
  note: '',
  managementCompanyId: '',
  vendorId: '',
};

/** 値の出どころ（詳細に出す。手で入れた値は自動で上書きしない） */
export type FieldSource = 'preset' | 'default' | 'filename' | 'mtime' | 'text' | 'ai' | 'manual' | 'bulk';

export const FIELD_SOURCE_LABEL: Record<FieldSource, string> = {
  preset: '開いた行',
  default: '画面の既定',
  filename: 'ファイル名',
  mtime: 'ファイルの更新日',
  text: '文字情報',
  ai: 'AI-OCR',
  manual: '手入力',
  bulk: '一括設定',
};

export interface RowState {
  input: RowInput;
  /** 項目ごとの値の出どころ */
  sources: Partial<Record<RowField, FieldSource>>;
  /** 自動で読んだ値が、入っている値と食い違った項目（読んだ値と出どころ） */
  conflicts: Partial<Record<RowField, { value: string; source: FieldSource }>>;
}

export const EMPTY_ROW_STATE: RowState = { input: EMPTY_ROW_INPUT, sources: {}, conflicts: {} };

/** 人がこの画面で決めた値（手入力・一括設定）。自動で読んだ値と違っても食い違いにしない */
const isHumanChoice = (s: FieldSource | undefined) => s === 'manual' || s === 'bulk';

/**
 * 自動で読んだ値を入れる（②ファイル名 → ③文字情報 → ④AI-OCR の順に呼ぶ）。空の項目だけ埋め、
 * 入っている値と違えば食い違いとして残す（ステータスが「要確認」になる）
 */
export function mergeAuto(state: RowState, patch: Partial<RowInput>, source: FieldSource): RowState {
  const input = { ...state.input };
  const sources = { ...state.sources };
  const conflicts = { ...state.conflicts };
  for (const [k, v] of Object.entries(patch) as [RowField, string | undefined][]) {
    if (!v) continue;
    const cur = input[k];
    // 更新日・画面の既定（報告書一括アップロードの区分など）は手掛かりが無いときの仮の値なので、後から読めた値で黙って置き換える
    if (!cur || ((sources[k] === 'mtime' || sources[k] === 'default') && source !== sources[k])) {
      (input as Record<RowField, string>)[k] = v;
      sources[k] = source;
    } else if (cur !== v && k !== 'note' && source !== 'mtime' && !isHumanChoice(sources[k])) {
      // 入っている値はそのまま。開いた行の値・先に読んだ値と違えば知らせる（この画面で人が選んだ値には知らせない）。
      // ファイルの更新日は手掛かりが無いときの仮の値なので、入っている値と違っても知らせない（要確認で止めない）
      conflicts[k] = { value: v, source };
    }
  }
  return { input, sources, conflicts };
}

/** 人が入れた値（手入力・一括設定）。その項目の食い違いは解消したことにする */
export function setFields(state: RowState, patch: Partial<RowInput>, source: 'manual' | 'bulk' | 'preset' | 'default'): RowState {
  const sources = { ...state.sources };
  const conflicts = { ...state.conflicts };
  for (const k of Object.keys(patch) as RowField[]) {
    sources[k] = source;
    delete conflicts[k];
  }
  return { input: { ...state.input, ...patch }, sources, conflicts };
}

/** 一括設定の1項目（「変更しない」なら undefined） */
export type BulkPatch = Partial<Pick<RowInput, 'category' | 'performedOn' | 'propertyCode' | 'inspectionType' | 'note' | 'managementCompanyId' | 'vendorId'>>;

/** 選択中の行に一括設定を入れる（「変更しない」の項目は行ごとの値を変えない） */
export function applyBulk(states: Record<string, RowState>, keys: string[], patch: BulkPatch): Record<string, RowState> {
  const clean = Object.fromEntries(Object.entries(patch).filter(([, v]) => v !== undefined)) as Partial<RowInput>;
  if (Object.keys(clean).length === 0) return states;
  const next = { ...states };
  for (const key of keys) next[key] = setFields(next[key] ?? EMPTY_ROW_STATE, clean, 'bulk');
  return next;
}

// ---------------------------------------------------------------------------
// 報告書の点検の決め方
// ---------------------------------------------------------------------------

/** 物件・点検種別・保守会社・管理会社で絞った点検（1件に決まれば報告書を登録できる） */
export function candidateInspections(inspections: PortalInspectionRow[], input: RowInput): PortalInspectionRow[] {
  if (!input.propertyCode) return [];
  return inspections.filter(
    (i) =>
      i.property_code === input.propertyCode &&
      (!input.inspectionType || (i.inspection_type_label ?? '') === input.inspectionType) &&
      (!input.vendorId || inspectionOfVendor(i, input.vendorId)) &&
      (!input.managementCompanyId || !i.management_company_id || i.management_company_id === input.managementCompanyId),
  );
}

/** 報告書の対象月（YYYY-MM-01）。入れていなければ実施日の月（DB の portal_register_report と同じ） */
export function rowTargetMonth(input: RowInput): string | null {
  if (input.targetMonth) return `${input.targetMonth.slice(0, 7)}-01`;
  return input.performedOn ? monthOf(input.performedOn) : null;
}

/** 同じ点検・対象月の登録済みの報告書（提出・受領・差戻し。新しい順） */
export function liveReportsOf(reports: DbInspectionReport[], inspectionId: string, month: string | null): DbInspectionReport[] {
  if (!month) return [];
  return reports
    .filter(
      (r) =>
        r.property_inspection_id === inspectionId &&
        r.target_month === month &&
        (r.status === 'submitted' || r.status === 'accepted' || r.status === 'returned'),
    )
    .sort((a, b) => b.created_at.localeCompare(a.created_at));
}

// ---------------------------------------------------------------------------
// 入力の確認とステータス
// ---------------------------------------------------------------------------

export interface RowCheck {
  /** 送れない理由（項目ごと） */
  errors: Partial<Record<RowField | 'file' | 'inspection', string>>;
  /** 報告書の行で決まった点検（決まらなければ null） */
  inspection: PortalInspectionRow | null;
  /** 要確認（未入力・食い違い・点検が決まらない） */
  needsReview: boolean;
  /** 送るもの（区間のページが全部削除されていれば送らない） */
  skip: boolean;
}

export interface RowCheckContext {
  inspections: PortalInspectionRow[];
  source: UploadSource | undefined;
  /** 区間の大きさ（切り出した PDF の大きさ。分からなければ null） */
  size: number | null;
  /** 報告書を登録できるか（管理会社は登録できない） */
  canReport: boolean;
}

export function checkRow(row: UploadRow, state: RowState, ctx: RowCheckContext): RowCheck {
  const { input } = state;
  const errors: RowCheck['errors'] = {};
  const skip = !!row.segment && row.pages.length === 0;
  if (!input.category) errors.category = '区分を選んでください';
  else if (input.category === 'other' && !input.categoryNote.trim()) errors.categoryNote = '「その他」の内容を入れてください';
  if (!input.propertyCode) errors.propertyCode = '物件を選んでください';
  let inspection: PortalInspectionRow | null = null;
  if (input.category === 'report') {
    if (!ctx.canReport) errors.category = '報告書は保守会社・管理者だけが登録できます';
    if (ctx.source && ctx.source.kind !== 'pdf') errors.file = '報告書は PDF だけ登録できます（区分を変えてください）';
    if (!input.performedOn) errors.performedOn = '実施日を入れてください';
    if (!input.inspectionType) errors.inspectionType = '点検種別を選んでください';
    if (input.propertyCode && input.inspectionType) {
      const list = candidateInspections(ctx.inspections, input);
      if (list.length === 1) inspection = list[0] ?? null;
      else if (list.length === 0) errors.inspection = 'この物件・点検種別の点検がありません（保守会社・管理会社の絞り込みも確かめてください）';
      else errors.inspection = `点検が${list.length}件あります（保守会社を選んでください）`;
    }
  }
  if (ctx.size !== null && ctx.size > MAX_PROPERTY_FILE_BYTES) errors.file = 'ファイルが大きすぎます（50MB まで。区間を分けてください）';
  const needsReview = !skip && (Object.keys(errors).length > 0 || Object.keys(state.conflicts).length > 0);
  return { errors, inspection, needsReview, skip };
}

/** 表示順を保ったまま、区間の鍵が残っている入力だけを残す（ファイルを外した・区切りを外したときの片付け） */
export function pruneStates(states: Record<string, RowState>, rows: UploadRow[]): Record<string, RowState> {
  const keys = new Set(rows.map((r) => r.key));
  return Object.fromEntries(Object.entries(states).filter(([k]) => keys.has(k)));
}

/** その他ファイルの名前の連番（同じ「日付_建物_区分」になる行に _1・_2… を付けるため）。行の鍵 → [何番目, 全部で何件] */
export function nameSlots(rows: { key: string; base: string }[]): Record<string, [number, number]> {
  const groups = new Map<string, string[]>();
  for (const r of rows) groups.set(r.base, [...(groups.get(r.base) ?? []), r.key]);
  const out: Record<string, [number, number]> = {};
  for (const keys of groups.values()) keys.forEach((k, i) => (out[k] = [i, keys.length]));
  return out;
}

/** 空白ページか（小さく描いた画素のほとんどが白い）。data は RGBA */
export function isBlankPixels(data: Uint8ClampedArray, threshold = 0.995): boolean {
  let white = 0;
  const n = data.length / 4;
  if (n === 0) return false;
  for (let i = 0; i < data.length; i += 4) {
    const a = data[i + 3] ?? 255;
    const lum = ((data[i] ?? 0) + (data[i + 1] ?? 0) + (data[i + 2] ?? 0)) / 3;
    if (a < 16 || lum > 235) white += 1;
  }
  return white / n >= threshold;
}
