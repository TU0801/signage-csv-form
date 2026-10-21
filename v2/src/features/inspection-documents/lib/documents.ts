import type { DbInspectionReport, ReportStatus } from '@/types/portal';
import { normalizeSearch } from '@/lib/utils';
import { sanitizeFileNamePart } from './fileName';

/*
 * 点検報告書の整理（DocFlow の「建物 → 年 → 点検種別」の仮想ツリー・絞り込み・ZIP・CSV）。
 * 物理フォルダは作らず、DB の行（登録時に写した物件名・点検種別・実施日）から組み立てる。
 * 画面から切り離した純関数にしておき、テストで集計と組み立てを確かめる。
 */

export const REPORT_STATUS_LABELS: Record<ReportStatus, string> = {
  submitted: '提出',
  accepted: '受領',
  returned: '差戻し',
  superseded: '置き換え済み',
  deleted: '削除済み',
};

/** 提出中・受領・差戻し（置き換え済み・削除済みでない版） */
export const LIVE_STATUSES: ReportStatus[] = ['submitted', 'accepted', 'returned'];

export function reportYear(report: Pick<DbInspectionReport, 'performed_on'>): string {
  return report.performed_on.slice(0, 4);
}

// ---------------------------------------------------------------------------
// 絞り込み
// ---------------------------------------------------------------------------

export interface ReportFilters {
  search: string;
  /** '' は提出・受領・差戻しのすべて */
  status: '' | 'submitted' | 'accepted' | 'returned';
  showDeleted: boolean;
  /** 再提出で置き換えられた旧版も出す */
  showSuperseded: boolean;
  /** 実施日の期間（YYYY-MM-DD、空なら制限なし） */
  from: string;
  to: string;
  /** 保守会社（管理者・管理会社だけが選べる。'' はすべて） */
  vendorId: string;
}

export const DEFAULT_REPORT_FILTERS: ReportFilters = {
  search: '',
  status: '',
  showDeleted: false,
  showSuperseded: false,
  from: '',
  to: '',
  vendorId: '',
};

function statusVisible(status: ReportStatus, f: ReportFilters): boolean {
  if (status === 'deleted') return f.showDeleted;
  if (status === 'superseded') return f.showSuperseded;
  return !f.status || f.status === status;
}

export function filterReports(reports: DbInspectionReport[], f: ReportFilters): DbInspectionReport[] {
  const q = normalizeSearch(f.search);
  return reports.filter((r) => {
    if (!statusVisible(r.status, f)) return false;
    if (f.from && r.performed_on < f.from) return false;
    if (f.to && r.performed_on > f.to) return false;
    if (f.vendorId && r.vendor_id !== f.vendorId) return false;
    if (q) {
      const hay = normalizeSearch(
        [r.file_name, r.property_name, r.property_code, r.inspection_type_label, r.vendor_name ?? ''].join(' '),
      );
      if (!hay.includes(q)) return false;
    }
    return true;
  });
}

// ---------------------------------------------------------------------------
// 仮想ツリー（建物 → 年 → 点検種別）
// ---------------------------------------------------------------------------

/** ツリーで選んだ位置。上の階層ほど広い（建物だけ・建物と年・3つすべて） */
export interface TreeSelection {
  propertyCode: string;
  year?: string;
  inspectionType?: string;
}

export interface TreeTypeNode {
  label: string;
  count: number;
}

export interface TreeYearNode {
  year: string;
  count: number;
  types: TreeTypeNode[];
}

export interface TreeBuildingNode {
  propertyCode: string;
  propertyName: string;
  count: number;
  years: TreeYearNode[];
}

/** 建物は名前順、年は新しい順、点検種別は名前順。件数は渡した行（絞り込み後）で数える */
export function buildReportTree(reports: DbInspectionReport[]): TreeBuildingNode[] {
  const buildings = new Map<string, { name: string; years: Map<string, Map<string, number>> }>();
  for (const r of reports) {
    let b = buildings.get(r.property_code);
    if (!b) {
      b = { name: r.property_name, years: new Map() };
      buildings.set(r.property_code, b);
    }
    const year = reportYear(r);
    let types = b.years.get(year);
    if (!types) {
      types = new Map();
      b.years.set(year, types);
    }
    const label = r.inspection_type_label || '（点検種別なし）';
    types.set(label, (types.get(label) ?? 0) + 1);
  }
  return [...buildings.entries()]
    .map(([propertyCode, b]) => {
      const years = [...b.years.entries()]
        .map(([year, types]) => {
          const typeNodes = [...types.entries()]
            .map(([label, count]) => ({ label, count }))
            .sort((x, y) => x.label.localeCompare(y.label, 'ja'));
          return { year, count: typeNodes.reduce((s, t) => s + t.count, 0), types: typeNodes };
        })
        .sort((x, y) => y.year.localeCompare(x.year));
      return {
        propertyCode,
        propertyName: b.name,
        count: years.reduce((s, y) => s + y.count, 0),
        years,
      };
    })
    .sort((x, y) => x.propertyName.localeCompare(y.propertyName, 'ja') || x.propertyCode.localeCompare(y.propertyCode));
}

export function matchesTreeSelection(report: DbInspectionReport, sel: TreeSelection | null): boolean {
  if (!sel) return true;
  if (report.property_code !== sel.propertyCode) return false;
  if (sel.year && reportYear(report) !== sel.year) return false;
  if (sel.inspectionType && (report.inspection_type_label || '（点検種別なし）') !== sel.inspectionType) return false;
  return true;
}

// ---------------------------------------------------------------------------
// ZIP の中のパス
// ---------------------------------------------------------------------------

/**
 * ZIP の中のパス（渡した順に対応）。階層を保つときは「建物/年/点検種別/ファイル名」。
 * 同じパスが続いたら DocFlow（documents.py の ZIP）と同じく2件目から _1, _2 … を拡張子の前に付ける
 */
export function buildZipPaths(
  reports: Pick<DbInspectionReport, 'property_name' | 'performed_on' | 'inspection_type_label' | 'file_name'>[],
  keepHierarchy: boolean,
): string[] {
  const used = new Set<string>();
  return reports.map((r) => {
    // 表示名は保存時に禁止文字を除いているが、旧データや管理者の直しに備えて ZIP でも '/' などを落とす
    const fileName = r.file_name.replace(/[<>:"/\\|?*]/g, '') || 'report.pdf';
    const base = keepHierarchy
      ? [
          sanitizeFileNamePart(r.property_name) || '未設定',
          reportYear(r),
          sanitizeFileNamePart(r.inspection_type_label) || '未設定',
          fileName,
        ].join('/')
      : fileName;
    let path = base;
    const dot = base.lastIndexOf('.');
    const stem = dot > base.lastIndexOf('/') ? base.slice(0, dot) : base;
    const ext = dot > base.lastIndexOf('/') ? base.slice(dot) : '';
    for (let n = 1; used.has(path); n++) path = `${stem}_${n}${ext}`;
    used.add(path);
    return path;
  });
}

// ---------------------------------------------------------------------------
// CSV（一覧の書き出し）
// ---------------------------------------------------------------------------

const CSV_HEADERS = [
  'ファイル名',
  '物件コード',
  '建物',
  '点検種別',
  '実施日',
  '対象月',
  '保守会社',
  '状態',
  '差戻し理由',
  'メモ',
  '提出日時',
  'サイズ(バイト)',
];

function csvCell(value: string | number | null | undefined): string {
  const raw = value == null ? '' : String(value);
  // Excel で開いたときに数式として動かないよう、= + - @ タブ CR で始まる文字列は先頭に ' を付ける（数値はそのまま）
  const s = typeof value === 'string' && /^[=+\-@\t\r]/.test(raw) ? `'${raw}` : raw;
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** 日本時間の YYYY/MM/DD HH:mm（提出日時の表示・CSV） */
export function formatDateTimeJst(iso: string): string {
  const parts = new Intl.DateTimeFormat('ja-JP', {
    timeZone: 'Asia/Tokyo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(new Date(iso));
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? '';
  return `${get('year')}/${get('month')}/${get('day')} ${get('hour')}:${get('minute')}`;
}

/** BOM は downloadCsv が付ける */
export function reportsToCsv(reports: DbInspectionReport[]): string {
  const rows = reports.map((r) => [
    r.file_name,
    r.property_code,
    r.property_name,
    r.inspection_type_label,
    r.performed_on,
    r.target_month ? r.target_month.slice(0, 7) : '',
    r.vendor_name ?? '',
    REPORT_STATUS_LABELS[r.status],
    r.status === 'returned' ? (r.review_comment ?? '') : '',
    r.note ?? '',
    formatDateTimeJst(r.created_at),
    r.size_bytes ?? '',
  ]);
  return [CSV_HEADERS, ...rows].map((row) => row.map(csvCell).join(',')).join('\r\n');
}

export function formatBytes(bytes: number | null): string {
  if (bytes == null) return '';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

// ---------------------------------------------------------------------------
// 操作の出し分け（最終判断は DB の RPC。ここは押しても 42501 になるボタンを出さないためのもの）
// ---------------------------------------------------------------------------

export interface ReportViewer {
  isAdmin: boolean;
  isManagement: boolean;
  /** 保守会社アカウントの会社 */
  vendorId: string | null | undefined;
}

export interface ReportPermissions {
  /** 開く・ダウンロード（保管庫へ移した版は出さない） */
  canOpen: boolean;
  canEdit: boolean;
  canDelete: boolean;
  canRestore: boolean;
  canAccept: boolean;
  canReturn: boolean;
  canResubmit: boolean;
}

/**
 * portal_update_report と同じ判定: 管理者は全件、保守会社は自社（vendor_id）の版だけで受領済みは変えられない。
 * 受領・差戻しは管理会社と管理者（portal_review_report）。再提出は書ける人が置き換え前の版に対して行う
 */
export function reportPermissions(report: DbInspectionReport, viewer: ReportViewer): ReportPermissions {
  const live = LIVE_STATUSES.includes(report.status);
  const ownVendor = !viewer.isManagement && !!viewer.vendorId && report.vendor_id === viewer.vendorId;
  const writable = viewer.isAdmin || ownVendor;
  const lockedByAcceptance = !viewer.isAdmin && report.status === 'accepted';
  const reviewer = viewer.isAdmin || viewer.isManagement;
  return {
    canOpen: report.storage_backend === 'supabase',
    canEdit: writable && live && !lockedByAcceptance,
    canDelete: writable && report.status !== 'deleted' && !lockedByAcceptance,
    canRestore: writable && report.status === 'deleted',
    canAccept: reviewer && live && report.status !== 'accepted',
    canReturn: reviewer && live && report.status !== 'returned',
    canResubmit: writable && live,
  };
}
