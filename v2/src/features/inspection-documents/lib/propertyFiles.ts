import type { DbPropertyFile, PortalInspectionRow, PropertyFileCategory } from '@/types/portal';
import { normalizeSearch } from '@/lib/utils';
import type { PropertyCandidate, VendorCandidate } from './aiOcr';
import type { ReportFilters, TreeSelection } from './documents';
import { sanitizeFileNamePart } from './fileName';

/*
 * その他ファイル（修正依頼1025 G2）の画面に依らない計算: 区分の名前・ファイルの形式の確認・点検報告書ページのツリーへの載せ方。
 * ツリー（建物 → 年 → 種別）の「種別」の段に区分名（見積書など）で並べる。年は作業実施日、無ければ登録日（日本時間）
 */

export const PROPERTY_FILE_CATEGORIES: { value: PropertyFileCategory; label: string }[] = [
  { value: 'estimate', label: '見積書' },
  { value: 'invoice', label: '請求書' },
  { value: 'contract', label: '契約書' },
  { value: 'building_info', label: '建物関連情報' },
  { value: 'proposal', label: '提案書' },
  { value: 'photo', label: '写真' },
  { value: 'other', label: 'その他' },
];

const CATEGORY_LABEL = new Map(PROPERTY_FILE_CATEGORIES.map((c) => [c.value, c.label]));

/** ツリー・表に出す区分名。「その他」は自由記入があれば「その他（○○）」 */
export function propertyFileCategoryLabel(file: Pick<DbPropertyFile, 'category' | 'category_note'>): string {
  const base = CATEGORY_LABEL.get(file.category) ?? 'その他';
  return file.category === 'other' && file.category_note ? `${base}（${file.category_note}）` : base;
}

/** 拡張子 → 置くときの MIME（バケット property-files の許可と同じ）。OS によって File.type が空になるので拡張子で決める */
const EXTENSION_MIME: Record<string, string> = {
  pdf: 'application/pdf',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  xls: 'application/vnd.ms-excel',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  doc: 'application/msword',
  pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  ppt: 'application/vnd.ms-powerpoint',
  // 動画（修正依頼1029 決定③。バケットの許可は scripts/fix-1029-upload.sql で足す）
  mp4: 'video/mp4',
  mov: 'video/quicktime',
};

export const PROPERTY_FILE_ACCEPT = Object.keys(EXTENSION_MIME)
  .map((e) => `.${e}`)
  .join(',');

export const MAX_PROPERTY_FILE_BYTES = 50 * 1024 * 1024;

export function propertyFileMime(name: string): string | null {
  const ext = /\.([A-Za-z0-9]+)$/.exec(name)?.[1]?.toLowerCase();
  return ext ? (EXTENSION_MIME[ext] ?? null) : null;
}

/** 置ける形式・大きさか（問題なければ null） */
export function validatePropertyFile(file: Pick<File, 'name' | 'size'>): string | null {
  if (!propertyFileMime(file.name)) return 'PDF・画像（JPG/PNG）・Excel・Word・PowerPoint・動画（MP4/MOV）のファイルを選んでください';
  if (file.size === 0) return 'ファイルが空です';
  if (file.size > MAX_PROPERTY_FILE_BYTES) return 'ファイルが大きすぎます（50MB まで）';
  return null;
}

/** 表示名（保存時に禁止文字を除く。DB の portal_register_property_file と同じ規則） */
export function propertyFileDisplayName(name: string): string {
  return name.replace(/[<>:"/\\|?*]/g, '').trim().slice(0, 200) || 'file';
}

/**
 * 保存するファイル名（修正依頼1026 J4）。作業実施日があれば報告書と同じ規則（DocFlow）で
 * 「作業実施日(YYYYMMDD)_建物名_区分.拡張子」にする（複数のファイルは _1・_2… を付けて区別する）。
 * 作業実施日が無ければ元のファイル名のまま（禁止文字だけ除く）。元のファイル名は original_name に残る
 */
export function buildPropertyFileName(input: {
  docDate: string;
  propertyName: string;
  categoryLabel: string;
  originalName: string;
  index: number;
  total: number;
}): string {
  if (!input.docDate) return propertyFileDisplayName(input.originalName);
  const ext = /\.([A-Za-z0-9]+)$/.exec(input.originalName)?.[1]?.toLowerCase();
  const base = [
    input.docDate.replace(/-/g, ''),
    sanitizeFileNamePart(input.propertyName) || '未設定',
    sanitizeFileNamePart(input.categoryLabel) || 'その他',
  ].join('_');
  const suffix = input.total > 1 ? `_${input.index + 1}` : '';
  return propertyFileDisplayName(`${base}${suffix}${ext ? `.${ext}` : ''}`);
}

/** 一覧から建物の候補（物件コードごとに1つ、名前順） */
export function propertyCandidatesOf(inspections: Pick<PortalInspectionRow, 'property_code' | 'property_name'>[]): PropertyCandidate[] {
  const m = new Map<string, string>();
  for (const i of inspections) if (!m.has(i.property_code)) m.set(i.property_code, i.property_name);
  return [...m.entries()]
    .map(([code, name]) => ({ code, name }))
    .sort((a, b) => a.name.localeCompare(b.name, 'ja') || a.code.localeCompare(b.code));
}

/** 一覧から保守会社の候補（点検行の保守会社） */
export function vendorCandidatesOf(inspections: Pick<PortalInspectionRow, 'vendor_id' | 'vendor_name'>[]): VendorCandidate[] {
  const m = new Map<string, string>();
  for (const i of inspections) if (i.vendor_id && i.vendor_name) m.set(i.vendor_id, i.vendor_name);
  return [...m.entries()].map(([id, name]) => ({ id, name }));
}

/** 日本時間の日付（YYYY-MM-DD） */
function jstDate(iso: string): string {
  return new Date(new Date(iso).getTime() + 9 * 3600 * 1000).toISOString().slice(0, 10);
}

/** ツリーの年に使う日付（作業実施日、無ければ登録日） */
export function propertyFileDate(file: Pick<DbPropertyFile, 'doc_date' | 'created_at'>): string {
  return file.doc_date ?? jstDate(file.created_at);
}

/**
 * ツリーに載せる形（報告書と同じ列名）。点検種別の段に区分名を入れる。
 * buildReportTree・matchesTreeSelection はこの3列しか見ない
 */
export function propertyFileTreeRow(file: DbPropertyFile) {
  return {
    property_code: file.property_code,
    property_name: file.property_name,
    performed_on: propertyFileDate(file),
    inspection_type_label: propertyFileCategoryLabel(file),
  };
}

/**
 * 絞り込み（検索・期間・保守会社・削除済み）。状態（提出・受領・差戻し）は報告書だけのものなので、
 * 状態で絞っているときはファイルを出さない
 */
export function filterPropertyFiles(files: DbPropertyFile[], f: ReportFilters): DbPropertyFile[] {
  if (f.status) return [];
  const q = normalizeSearch(f.search);
  return files.filter((file) => {
    if (file.status === 'deleted' && !f.showDeleted) return false;
    if (f.vendorId && file.vendor_id !== f.vendorId) return false;
    const date = propertyFileDate(file);
    if (f.from && date < f.from) return false;
    if (f.to && date > f.to) return false;
    if (q) {
      const hay = normalizeSearch(
        [file.file_name, file.property_name, file.property_code, propertyFileCategoryLabel(file), file.vendor_name ?? '', file.note ?? ''].join(' '),
      );
      if (!hay.includes(q)) return false;
    }
    return true;
  });
}

export function propertyFileInSelection(file: DbPropertyFile, sel: TreeSelection | null): boolean {
  if (!sel) return true;
  if (file.property_code !== sel.propertyCode) return false;
  if (sel.year && propertyFileDate(file).slice(0, 4) !== sel.year) return false;
  if (sel.inspectionType && propertyFileCategoryLabel(file) !== sel.inspectionType) return false;
  return true;
}

/**
 * 削除できるか（管理者・上げた本人・上げた会社。修正依頼1029 決定②。最終判断は RPC portal_delete_property_file）。
 * 一覧の can_delete（DB の property_file_can_delete。RPC と同じ判定）があればそれに従う。無いとき（テストなど）は
 * 行で分かる範囲の近似（管理会社は上げた人の会社が行に無いので、保守会社の無いファイルで物件の管理会社が自社なら出す）
 */
export function canDeletePropertyFile(
  file: DbPropertyFile,
  viewer: {
    isAdmin: boolean;
    userId: string | null | undefined;
    vendorId?: string | null;
    managementCompanyId?: string | null;
  },
): boolean {
  if (file.status !== 'active') return false;
  if (typeof file.can_delete === 'boolean') return file.can_delete;
  if (viewer.isAdmin) return true;
  if (viewer.userId && file.uploaded_by === viewer.userId) return true;
  if (viewer.vendorId && file.vendor_id === viewer.vendorId) return true;
  return !!viewer.managementCompanyId && !file.vendor_id && file.management_company_id === viewer.managementCompanyId;
}
