import type { PropertyFileCategory } from '@/types/portal';
import { todayJst } from '@/features/inspection-portal/lib/schedule';
import { companyCore, matchInspectionTypeInText, nameCore, parseJapaneseDate } from './aiOcr';

/*
 * ファイルのアップロード（修正依頼1029(1)）の自動入力②: ファイル名から区分・物件・取引先（保守会社・管理会社）・点検種別・日付を取る。
 * 取れなかった日付はファイルの更新日（File.lastModified を日本時間の日付に）。どれも入力欄の初期値で、人が直せる。
 * この後に③文字情報から読み取る（AI なし）④AI-OCR（チェックで使う）⑤手動、の順で足りない所を埋める。
 */

/** 区分（報告書は点検に結び付けて報告書として登録、それ以外はその他ファイル） */
export type UploadCategory = 'report' | PropertyFileCategory;

export const UPLOAD_CATEGORIES: { value: UploadCategory; label: string }[] = [
  { value: 'report', label: '報告書' },
  { value: 'estimate', label: '見積書' },
  { value: 'invoice', label: '請求書' },
  { value: 'contract', label: '契約書' },
  { value: 'proposal', label: '提案書' },
  { value: 'building_info', label: '建物関連情報' },
  { value: 'photo', label: '写真' },
  { value: 'other', label: 'その他' },
];

/**
 * ファイル名の言葉 → 区分の変換表（ここ1か所にまとめる。足すときは words に言葉を足すか行を足す）。
 * 上の行から順に見て、最初に当たった行の区分にする（「点検見積書」は見積書。報告書の行は見積・請求などより後に置く）
 */
export const CATEGORY_KEYWORDS: { category: UploadCategory; words: string[] }[] = [
  { category: 'estimate', words: ['御見積書', '御見積', '見積書', '見積', 'お見積'] },
  { category: 'invoice', words: ['御請求書', '請求書', '請求'] },
  { category: 'contract', words: ['契約書', '契約'] },
  { category: 'proposal', words: ['提案書', '提案'] },
  { category: 'building_info', words: ['建物関連', '図面', '竣工'] },
  { category: 'report', words: ['報告書', '報告', '点検'] },
  { category: 'photo', words: ['写真', '画像'] },
];

const IMAGE_OR_VIDEO = /\.(jpe?g|png|mp4|mov)$/i;

/** ファイル名から区分（変換表に当たらない画像・動画は写真、それ以外は null） */
export function categoryFromFileName(name: string): UploadCategory | null {
  const s = name.normalize('NFKC');
  for (const row of CATEGORY_KEYWORDS) if (row.words.some((w) => s.includes(w))) return row.category;
  return IMAGE_OR_VIDEO.test(name) ? 'photo' : null;
}

function validIso(y: number, m: number, d: number): string | null {
  if (y < 2000 || y > 2099 || m < 1 || m > 12 || d < 1 || d > 31) return null;
  const dt = new Date(Date.UTC(y, m - 1, d));
  if (dt.getUTCMonth() !== m - 1) return null;
  return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

/**
 * ファイル名の日付（20261025・2026-10-25・2026_10_25・2026.10.25・2026年10月25日・R8.10.25・令和8年10月25日）。無ければ null。
 * 8桁は前後に数字が続かないものだけ（物件コードなどの長い数字の一部を日付にしない）
 */
export function dateFromFileName(name: string): string | null {
  const s = name.normalize('NFKC').replace(/\.[A-Za-z0-9]+$/, '');
  const eight = /(?<!\d)(20\d{2})(\d{2})(\d{2})(?!\d)/.exec(s);
  if (eight) {
    const iso = validIso(Number(eight[1]), Number(eight[2]), Number(eight[3]));
    if (iso) return iso;
  }
  const sep = /(?<!\d)(20\d{2})[-_./年](\d{1,2})[-_./月](\d{1,2})(?!\d)/.exec(s);
  if (sep) {
    const iso = validIso(Number(sep[1]), Number(sep[2]), Number(sep[3]));
    if (iso) return iso;
  }
  // 和暦（R8.10.25・令和8年10月25日）。区切りの _ と - は . に寄せてから読む
  return parseJapaneseDate(s.replace(/(?<=\d)[-_](?=\d)/g, '.'));
}

/** ファイルの更新日（ミリ秒）を日本時間の日付に */
export function jstDateOfEpoch(ms: number): string {
  return todayJst(new Date(ms));
}

export interface PropertyAlias {
  code: string;
  /** signage の物件名 */
  name: string;
  /** 業務システムの物件名・物件名略称・サイネージ名（無ければ空） */
  aliases: string[];
  managementCompanyId: string | null;
}

export interface CompanyAlias {
  id: string;
  name: string;
  shortName: string | null;
}

/** 照合に使う名前の短さの下限（短すぎる略称で取り違えない） */
const MIN_ALIAS_LENGTH = 3;

/** ファイル名に含まれる物件（物件コード、または名前・略称の最長一致。同じ長さで別の物件が並べば選ばない） */
export function propertyFromFileName(name: string, properties: PropertyAlias[]): PropertyAlias | null {
  const raw = name.normalize('NFKC');
  const byCode = properties.filter((p) => p.code.length >= 4 && raw.includes(p.code));
  if (byCode.length === 1) return byCode[0] ?? null;
  const hay = nameCore(raw.replace(/\.[A-Za-z0-9]+$/, '').replace(/_/g, ' '));
  let best: { p: PropertyAlias; len: number } | null = null;
  let tie = false;
  for (const p of properties) {
    for (const alias of [p.name, ...p.aliases]) {
      const core = nameCore(alias);
      if (core.length < MIN_ALIAS_LENGTH || !hay.includes(core)) continue;
      if (!best || core.length > best.len) {
        best = { p, len: core.length };
        tie = false;
      } else if (core.length === best.len && best.p.code !== p.code) tie = true;
    }
  }
  return best && !tie ? best.p : null;
}

/** ファイル名に含まれる会社（名前・略称の法人格を除いた核の最長一致。同じ長さで別の会社が並べば選ばない） */
export function companyFromFileName(name: string, companies: CompanyAlias[]): CompanyAlias | null {
  const hay = nameCore(name.normalize('NFKC').replace(/_/g, ' '));
  let best: { c: CompanyAlias; len: number } | null = null;
  let tie = false;
  for (const c of companies) {
    for (const alias of [c.name, c.shortName ?? '']) {
      const core = companyCore(alias);
      if (core.length < 2 || !hay.includes(core)) continue;
      if (!best || core.length > best.len) {
        best = { c, len: core.length };
        tie = false;
      } else if (core.length === best.len && best.c.id !== c.id) tie = true;
    }
  }
  return best && !tie ? best.c : null;
}

export interface FileNameContext {
  properties: PropertyAlias[];
  vendors: CompanyAlias[];
  managementCompanies: CompanyAlias[];
  inspectionTypes: string[];
}

export interface FileNameExtraction {
  category: UploadCategory | null;
  propertyCode: string | null;
  vendorId: string | null;
  managementCompanyId: string | null;
  inspectionType: string | null;
  /** 実施日（ファイル名、無ければ更新日） */
  performedOn: string | null;
  performedOnSource: 'filename' | 'mtime' | null;
}

/** ファイル名から取れるものを取る（取れない項目は null） */
export function extractFromFileName(file: Pick<File, 'name' | 'lastModified'>, ctx: FileNameContext): FileNameExtraction {
  const property = propertyFromFileName(file.name, ctx.properties);
  const vendor = companyFromFileName(file.name, ctx.vendors);
  const management = companyFromFileName(file.name, ctx.managementCompanies);
  const fromName = dateFromFileName(file.name);
  const mtime = file.lastModified ? jstDateOfEpoch(file.lastModified) : null;
  return {
    category: categoryFromFileName(file.name),
    propertyCode: property?.code ?? null,
    vendorId: vendor?.id ?? null,
    // 物件が決まれば物件の管理会社、無ければファイル名の会社名
    managementCompanyId: property?.managementCompanyId ?? management?.id ?? null,
    inspectionType: matchInspectionTypeInText(file.name.normalize('NFKC').replace(/_/g, ' '), ctx.inspectionTypes),
    performedOn: fromName ?? mtime,
    performedOnSource: fromName ? 'filename' : mtime ? 'mtime' : null,
  };
}
