/*
 * AI-OCR（修正依頼1025 G2・G4）の画面側の処理。Edge Function signage-ai-ocr が Claude Haiku で読んだ値（または
 * PDF の文字情報だけ）を、範囲内の物件・点検種別・保守会社に照らして初期値にする。人が確かめて直す前提で、自動で確定しない。
 *
 * 後処理は DocFlow（backend/shared/ocr_service.py・text_postprocessor.py・field_processors.py・name_match.py）から移した:
 *   - 日付の正規表現（和暦・西暦・2桁年・範囲）と、5桁年（20225年）・数字に似た文字（O→0 など）の OCR 誤りの補正
 *   - 建物名: 核の一致（敬称・ラベル・空白を除く）→ あいまい一致（0.85 以上、意味のある接尾辞の差は除く）→
 *     ページの文字に含まれる物件名の最長一致（4文字以上）
 *   - 会社名: 法人格（株式会社・㈱ など）を除いて一致、候補が1つのときだけ当てる（invoice-intake の名寄せと同じ）
 *   - 点検種別: 一致 → 包含 → 一致率 0.6 以上で最大のもの（DocFlow の value_mappings と同じ閾値）
 * 自己改善（invoice-intake に倣う。プロンプトは変えない）: 人が確定した値を signage_ocr_corrections に記録し、
 * 同じ読みに2回以上同じ確定があり、別の値に割れていなければ、次から照合より先に当てる。
 * 純関数だけを置き、テスト（__tests__/aiOcr.test.ts）で確かめる。
 */

import { isPropertyFileCategory, type PropertyFileCategory } from '@/types/portal';

/** 送るページ数の上限（Edge Function の MAX_PDF_PAGES と同じ値） */
export const AI_OCR_MAX_PDF_PAGES = 10;
/** 文字で送るページ数の上限（Edge Function の MAX_TEXT_PAGES と同じ値） */
export const AI_OCR_MAX_TEXT_PAGES = 30;

export const DOCUMENT_TYPES = [
  '点検報告書',
  'リモート点検報告書',
  '警備報告書',
  '故障対応報告書',
  '見積書',
  '請求書',
  '契約書',
  '提案書',
  '建物関連情報',
  '写真',
  'その他',
] as const;
export type OcrDocumentType = (typeof DOCUMENT_TYPES)[number];

/** Edge Function が返す読み取り結果（読めない項目は空文字） */
export interface AiOcrPage {
  page: number;
  building_name: string;
  inspection_type: string;
  performed_on: string;
}

export interface AiOcrRaw {
  document_type: OcrDocumentType | string;
  target_month_text: string;
  target_month: string;
  performed_on_text: string;
  performed_on: string;
  vendor_name: string;
  inspection_type: string;
  pages: AiOcrPage[];
}

// ---------------------------------------------------------------------------
// 文字の正規化と OCR 誤りの補正
// ---------------------------------------------------------------------------

const JP = '\\u3040-\\u309F\\u30A0-\\u30FF\\u4E00-\\u9FFF\\u3000-\\u303F\\u2160-\\u217F';

/**
 * 全角英数・半角カナを NFKC でそろえ、日本語の文字の間・数字と年月日の間の空白を除く
 * （DocFlow normalize_japanese_text と同じ考え方）
 */
export function normalizeOcrText(text: string): string {
  let s = (text ?? '').normalize('NFKC');
  const between = new RegExp(`([${JP}])\\s+([${JP}])`, 'g');
  while (between.test(s)) s = s.replace(between, '$1$2');
  s = s.replace(new RegExp(`([${JP}])\\s+(\\d)`, 'g'), '$1$2').replace(new RegExp(`(\\d)\\s+([${JP}])`, 'g'), '$1$2');
  return s.replace(/[ \t]+/g, ' ').trim();
}

/** 数字に似た文字（DocFlow SIMILAR_CHARS の数字の分） */
const DIGIT_LIKE: Record<string, string> = {
  O: '0', o: '0', '○': '0', '〇': '0', Ο: '0', ο: '0', О: '0', о: '0',
  l: '1', I: '1', '|': '1', ı: '1', і: '1',
  Z: '2', z: '2', S: '5', s: '5', b: '6', G: '6', B: '8', g: '9', q: '9',
};
const DIGIT_LIKE_CLASS = `[${Object.keys(DIGIT_LIKE).map((c) => c.replace(/[|\\\]^-]/g, '\\$&')).join('')}]`;

/** 日付の文字の中の、年・月・日・区切りの直前や数字に挟まれた「数字に似た文字」を数字に直す */
export function fixDigitLikeChars(text: string): string {
  return text
    .replace(new RegExp(`${DIGIT_LIKE_CLASS}(?=[年月日/.\\-])`, 'g'), (c) => DIGIT_LIKE[c] ?? c)
    .replace(new RegExp(`(?<=\\d)${DIGIT_LIKE_CLASS}(?=\\d)`, 'g'), (c) => DIGIT_LIKE[c] ?? c);
}

// ---------------------------------------------------------------------------
// 日付
// ---------------------------------------------------------------------------

const ERA_BASE: Record<string, number> = { 令和: 2018, 平成: 1988, R: 2018, H: 1988 };

function validIso(y: number, m: number, d: number): string | null {
  if (y < 2000 || y > 2099 || m < 1 || m > 12 || d < 1 || d > 31) return null;
  const dt = new Date(Date.UTC(y, m - 1, d));
  if (dt.getUTCMonth() !== m - 1) return null;
  return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

/** 5桁年（20225年 → 2025年）の OCR 誤りを直す（DocFlow _parse_japanese_date と同じ） */
function fixFiveDigitYear(s: string): string {
  return s.replace(/(20)(\d)(\d{2})(?=[年/.-])/g, '$1$3');
}

const ERA_DATE = /(令和|平成|[RH])\s*(\d{1,2}|元)\s*[年./]\s*(\d{1,2})\s*[月./]\s*(\d{1,2})\s*日?/;
const WESTERN_DATE = /(\d{4})\s*[年/.-]\s*(\d{1,2})\s*[月/.-]\s*(\d{1,2})\s*日?/;
const SHORT_YEAR_DATE = /(?<!\d)(\d{2})年(\d{1,2})月(\d{1,2})日/;

function prepareDateText(text: string): string {
  return fixFiveDigitYear(fixDigitLikeChars(normalizeOcrText(text)));
}

function matchToIso(m: RegExpExecArray, kind: 'era' | 'western' | 'short'): string | null {
  if (kind === 'era') {
    const year = (m[2] === '元' ? 1 : Number(m[2])) + (ERA_BASE[m[1] ?? ''] ?? 0);
    return validIso(year, Number(m[3]), Number(m[4]));
  }
  if (kind === 'western') return validIso(Number(m[1]), Number(m[2]), Number(m[3]));
  return validIso(2000 + Number(m[1]), Number(m[2]), Number(m[3]));
}

/** 和暦（令和6年12月15日・R6.12.15・令和元年）・西暦（2024年12月15日・2024/12/15）・2桁年（25年10月6日）を YYYY-MM-DD に */
export function parseJapaneseDate(text: string): string | null {
  if (!text) return null;
  const s = prepareDateText(text);
  const era = ERA_DATE.exec(s);
  if (era) return matchToIso(era, 'era');
  const w = WESTERN_DATE.exec(s);
  if (w) return matchToIso(w, 'western');
  const short = SHORT_YEAR_DATE.exec(s);
  if (short) return matchToIso(short, 'short');
  return null;
}

/** 文中の日付をすべて（出てきた順、重なりなし） */
export function findDates(text: string): string[] {
  const s = prepareDateText(text);
  const found: { index: number; iso: string }[] = [];
  const patterns: [RegExp, 'era' | 'western' | 'short'][] = [
    [new RegExp(ERA_DATE.source, 'g'), 'era'],
    [new RegExp(WESTERN_DATE.source, 'g'), 'western'],
    [new RegExp(SHORT_YEAR_DATE.source, 'g'), 'short'],
  ];
  const taken: [number, number][] = [];
  for (const [re, kind] of patterns) {
    for (const m of s.matchAll(re)) {
      const start = m.index ?? 0;
      const end = start + m[0].length;
      if (taken.some(([a, b]) => start < b && end > a)) continue;
      const iso = matchToIso(m as RegExpExecArray, kind);
      if (iso) {
        taken.push([start, end]);
        found.push({ index: start, iso });
      }
    }
  }
  return found.sort((a, b) => a.index - b.index).map((f) => f.iso);
}

/** 「2026年10月1日～2026年10月31日」のような範囲（「～〜-－から」で区切られた2つの日付）。無ければ null */
export function parseDateRange(text: string): { start: string; end: string } | null {
  const s = prepareDateText(text);
  const parts = s.split(/[~〜～]|から|\s-\s/);
  if (parts.length < 2) return null;
  const start = parseJapaneseDate((parts[0] ?? '').slice(-30));
  let end = parseJapaneseDate((parts[1] ?? '').slice(0, 30));
  // 後ろの日付が「31日」「10月31日」だけのとき、前の年・月を引き継ぐ
  if (start && !end) {
    const md = /^\s*(?:(\d{1,2})\s*月)?\s*(\d{1,2})\s*日/.exec(parts[1] ?? '');
    if (md) end = validIso(Number(start.slice(0, 4)), md[1] ? Number(md[1]) : Number(start.slice(5, 7)), Number(md[2]));
  }
  if (!start || !end || end < start) return null;
  return { start, end };
}

/** 「2026年10月分」「令和8年10月分」「2026/10月分」「R8.10分」→ YYYY-MM-01。無ければ null */
export function parseTargetMonth(text: string): string | null {
  if (!text) return null;
  const s = fixFiveDigitYear(fixDigitLikeChars(normalizeOcrText(text)));
  const era = /(令和|平成|[RH])\s*(\d{1,2}|元)\s*[年./]\s*(\d{1,2})\s*月?\s*分/.exec(s);
  if (era) {
    const y = (era[2] === '元' ? 1 : Number(era[2])) + (ERA_BASE[era[1] ?? ''] ?? 0);
    const m = Number(era[3]);
    if (y >= 2000 && y <= 2099 && m >= 1 && m <= 12) return `${y}-${String(m).padStart(2, '0')}-01`;
  }
  const w = /(\d{4})\s*[年/.-]\s*(\d{1,2})\s*月?\s*分/.exec(s);
  if (w) {
    const y = Number(w[1]);
    const m = Number(w[2]);
    if (y >= 2000 && y <= 2099 && m >= 1 && m <= 12) return `${y}-${String(m).padStart(2, '0')}-01`;
  }
  return null;
}

/** AI が返した YYYY-MM / YYYY-MM-DD が正しい形か（違えば元の文字列を読み直す） */
function isoMonthOrNull(v: string): string | null {
  const m = /^(\d{4})-(\d{2})(?:-\d{2})?$/.exec(v ?? '');
  if (!m) return null;
  const mm = Number(m[2]);
  return Number(m[1]) >= 2000 && mm >= 1 && mm <= 12 ? `${m[1]}-${m[2]}-01` : null;
}

function isoDateOrNull(v: string): string | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(v ?? '');
  return m ? validIso(Number(m[1]), Number(m[2]), Number(m[3])) : null;
}

// ---------------------------------------------------------------------------
// 名前の照合
// ---------------------------------------------------------------------------

/** 名称で意味を持たない文字（敬称・ラベル・記号・空白）。長音・ハイフンは意味を持ちうるので残す（DocFlow name_match） */
const NOISE = /お客様名|物件名|建物名|マンション名|ビル名|管理組合|御中|様方|殿|様|[\s:;・,、。「」『』【】()]/g;

/** 照合用の核（NFKC・小文字・敬称や記号を除く・ビルディング→ビル） */
export function nameCore(name: string): string {
  return normalizeOcrText(name ?? '')
    .toLowerCase()
    .replace(NOISE, '')
    .replace(/ビルディング$|ビルヂング$/, 'ビル')
    .replace(/マンシヨン/g, 'マンション');
}

/** 片方の核がもう片方の真部分文字列なら、別の建物（「天神」と「天神MERS」「天神Ⅲ」）とみなす */
export function isMeaningfulDiff(a: string, b: string): boolean {
  const ca = nameCore(a);
  const cb = nameCore(b);
  if (!ca || !cb || ca === cb) return false;
  return ca.includes(cb) || cb.includes(ca);
}

/** 一致率（編集距離による 0〜1。SequenceMatcher.ratio の代わり） */
export function similarity(a: string, b: string): number {
  if (!a || !b) return 0;
  if (a === b) return 1;
  const m = a.length;
  const n = b.length;
  let prev: number[] = Array.from({ length: n + 1 }, (_, j) => j);
  for (let i = 1; i <= m; i++) {
    const cur: number[] = [i];
    for (let j = 1; j <= n; j++) {
      cur[j] = Math.min((prev[j] ?? 0) + 1, (cur[j - 1] ?? 0) + 1, (prev[j - 1] ?? 0) + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
    prev = cur;
  }
  return 1 - (prev[n] ?? 0) / Math.max(m, n);
}

export interface PropertyCandidate {
  code: string;
  name: string;
}

export type MatchMethod = 'dictionary' | 'exact' | 'fuzzy' | 'fulltext';

export interface PropertyMatch extends PropertyCandidate {
  method: MatchMethod;
  score: number;
}

const BUILDING_FUZZY_MIN = 0.85;
const BUILDING_FULLTEXT_MIN_LEN = 4;

/** 読んだ建物名を範囲内の物件に当てる（核の一致 → あいまい一致）。決めきれなければ null */
export function matchBuildingName(read: string, candidates: PropertyCandidate[]): PropertyMatch | null {
  const core = nameCore(read);
  if (!core) return null;
  const exact = candidates.filter((c) => nameCore(c.name) === core);
  if (exact.length === 1 && exact[0]) return { ...exact[0], method: 'exact', score: 1 };
  if (exact.length > 1) return null;
  let best: PropertyMatch | null = null;
  let second = 0;
  for (const c of candidates) {
    if (isMeaningfulDiff(read, c.name)) continue;
    const score = similarity(core, nameCore(c.name));
    if (!best || score > best.score) {
      second = best?.score ?? 0;
      best = { ...c, method: 'fuzzy', score };
    } else if (score > second) second = score;
  }
  // 同じくらい似た物件が2つあるときは選ばない
  if (best && best.score >= BUILDING_FUZZY_MIN && best.score - second >= 0.05) return best;
  return null;
}

/** ページの文字に含まれる物件名の最長一致（DocFlow の全文フォールバック）。同じ長さで別の物件が並べば選ばない */
export function matchBuildingInText(pageText: string, candidates: PropertyCandidate[]): PropertyMatch | null {
  const hay = nameCore(pageText);
  if (!hay) return null;
  const hits = candidates
    .map((c) => ({ c, core: nameCore(c.name) }))
    .filter(({ core }) => core.length >= BUILDING_FULLTEXT_MIN_LEN && hay.includes(core));
  if (hits.length === 0) return null;
  const longest = Math.max(...hits.map((h) => h.core.length));
  const top = hits.filter((h) => h.core.length === longest);
  const codes = new Set(top.map((h) => h.c.code));
  if (codes.size !== 1 || !top[0]) return null;
  return { ...top[0].c, method: 'fulltext', score: 0.65 };
}

const LEGAL_FORMS = /株式会社|有限会社|合同会社|合資会社|一般社団法人|\(株\)|\(有\)|co\.,?\s*ltd\.?|inc\.?|ltd\.?/gi;

/** 会社名の核（法人格・空白・記号を除く。㈱ は NFKC で (株) になる） */
export function companyCore(name: string): string {
  return nameCore((name ?? '').normalize('NFKC').replace(LEGAL_FORMS, ''));
}

export interface VendorCandidate {
  id: string;
  name: string;
}

/** 会社名を保守会社に当てる。核の一致、無ければ包含（2文字以上）。候補が1つのときだけ（invoice-intake の名寄せ） */
export function matchCompany(read: string, vendors: VendorCandidate[]): VendorCandidate | null {
  const core = companyCore(read);
  if (core.length < 2) return null;
  const exact = vendors.filter((v) => companyCore(v.name) === core);
  if (exact.length === 1) return exact[0] ?? null;
  if (exact.length > 1) return null;
  const partial = vendors.filter((v) => {
    const vc = companyCore(v.name);
    return vc.length >= 2 && (core.includes(vc) || vc.includes(core));
  });
  return partial.length === 1 ? (partial[0] ?? null) : null;
}

/** ページの文字に名前が出てくる保守会社（1社だけのとき） */
export function matchCompanyInText(pageText: string, vendors: VendorCandidate[]): VendorCandidate | null {
  const hay = nameCore(pageText.normalize('NFKC'));
  const hits = vendors.filter((v) => {
    const vc = companyCore(v.name);
    return vc.length >= 2 && hay.includes(vc);
  });
  return hits.length === 1 ? (hits[0] ?? null) : null;
}

const INSPECTION_TYPE_MIN = 0.6;

/** 読んだ点検種別を候補（点検種別名）に当てる */
export function matchInspectionType(read: string, labels: string[]): string | null {
  const core = nameCore(read);
  if (!core) return null;
  const uniq = [...new Set(labels.filter(Boolean))];
  const exact = uniq.find((l) => nameCore(l) === core);
  if (exact) return exact;
  const contains = uniq.filter((l) => {
    const lc = nameCore(l);
    return lc.length >= 2 && (core.includes(lc) || lc.includes(core));
  });
  if (contains.length === 1) return contains[0] ?? null;
  let best: string | null = null;
  let bestScore = 0;
  let tie = false;
  for (const l of contains.length > 1 ? contains : uniq) {
    const score = similarity(core, nameCore(l));
    if (score > bestScore) {
      best = l;
      bestScore = score;
      tie = false;
    } else if (score === bestScore) tie = true;
  }
  return best && bestScore >= INSPECTION_TYPE_MIN && !tie ? best : null;
}

/** ページの文字に出てくる点検種別名（最長のもの。同じ長さで別の名前が並べば選ばない） */
export function matchInspectionTypeInText(pageText: string, labels: string[]): string | null {
  const hay = nameCore(pageText);
  if (!hay) return null;
  const hits = [...new Set(labels.filter(Boolean))].filter((l) => {
    const lc = nameCore(l);
    return lc.length >= 2 && hay.includes(lc);
  });
  if (hits.length === 0) return null;
  const longest = Math.max(...hits.map((l) => nameCore(l).length));
  const top = hits.filter((l) => nameCore(l).length === longest);
  return top.length === 1 ? (top[0] ?? null) : null;
}

// ---------------------------------------------------------------------------
// 書類の種類 → その他ファイルの区分
// ---------------------------------------------------------------------------


/** 書類の種類（AI か文字の手掛かり）から、その他ファイルの区分の初期値。報告書の類は「その他」＋種類名 */
export function categoryOfDocumentType(docType: string): { category: PropertyFileCategory; note: string } {
  switch (docType) {
    case '見積書':
      return { category: 'estimate', note: '' };
    case '請求書':
      return { category: 'invoice', note: '' };
    case '契約書':
      return { category: 'contract', note: '' };
    case '提案書':
      return { category: 'proposal', note: '' };
    case '写真':
      return { category: 'photo', note: '' };
    case '建物関連情報':
      return { category: 'building_info', note: '' };
    default:
      return { category: 'other', note: docType && docType !== 'その他' ? docType : '' };
  }
}

/** 文字の手掛かりで書類の種類を当てる（AI を使わないとき）。見出しの言葉の出現で決める */
export function guessDocumentType(text: string): OcrDocumentType {
  const s = normalizeOcrText(text);
  const rules: [RegExp, OcrDocumentType][] = [
    [/警備.{0,6}報告/, '警備報告書'],
    [/リモート.{0,6}(点検|監視)/, 'リモート点検報告書'],
    [/(故障|緊急).{0,6}(対応|出動|報告)/, '故障対応報告書'],
    [/御?見積書/, '見積書'],
    [/御?請求書/, '請求書'],
    [/契約書/, '契約書'],
    [/提案書/, '提案書'],
    [/(点検|検査).{0,8}報告書|作業報告書/, '点検報告書'],
  ];
  return rules.find(([re]) => re.test(s))?.[1] ?? 'その他';
}

// ---------------------------------------------------------------------------
// 自己改善の辞書
// ---------------------------------------------------------------------------

export type CorrectionField = 'property' | 'inspection_type' | 'vendor' | 'category';

/** RPC ocr_correction_dictionary の1行 */
export interface CorrectionRow {
  field: CorrectionField;
  raw_text: string;
  resolved_value: string;
  confirmations: number;
  conflicting: boolean;
}

/** 記録・照合に使う読みのキー（表記ゆれをそろえる。会社名は法人格も外す） */
export function correctionKey(field: CorrectionField, raw: string): string {
  return field === 'vendor' ? companyCore(raw) : nameCore(raw);
}

/** 自動で当てる確定の回数 */
export const AUTO_APPLY_CONFIRMATIONS = 2;

export type CorrectionDictionary = Map<string, string>;

/** 2回以上同じ確定があり、別の値に割れていない読みだけを辞書にする */
export function buildCorrectionDictionary(rows: CorrectionRow[]): CorrectionDictionary {
  const dict: CorrectionDictionary = new Map();
  for (const r of rows) {
    if (r.conflicting || Number(r.confirmations) < AUTO_APPLY_CONFIRMATIONS) continue;
    dict.set(`${r.field}:${r.raw_text}`, r.resolved_value);
  }
  return dict;
}

export function lookupCorrection(dict: CorrectionDictionary, field: CorrectionField, raw: string): string | null {
  const key = correctionKey(field, raw);
  return key ? (dict.get(`${field}:${key}`) ?? null) : null;
}

export interface CorrectionRecord {
  field: CorrectionField;
  raw_text: string;
  ai_value: string | null;
  resolved_value: string;
}

/** 記録の1件（読みが空なら記録しない） */
export function correctionRecord(
  field: CorrectionField,
  raw: string,
  aiValue: string | null,
  resolved: string | null,
): CorrectionRecord | null {
  const key = correctionKey(field, raw);
  if (!key || !resolved) return null;
  return { field, raw_text: key.slice(0, 200), ai_value: aiValue, resolved_value: resolved };
}

// ---------------------------------------------------------------------------
// 文字情報だけで読む（AI を使わない・費用なし）
// ---------------------------------------------------------------------------

/** 文字情報（テキスト層）があるか。半分以上のページに意味のある文字が30字以上あれば、文字で送れば足りるとみなす */
export function hasUsableTextLayer(pageTexts: string[]): boolean {
  if (pageTexts.length === 0) return false;
  const rich = pageTexts.filter((t) => normalizeOcrText(t).replace(/\s/g, '').length >= 30).length;
  return rich * 2 >= pageTexts.length;
}

/** 文字情報から、AI と同じ形の読み取り結果を作る（建物・会社は照合の段で全文から探す） */
export function readFromTextLayer(pageTexts: string[]): AiOcrRaw {
  const all = pageTexts.join('\n');
  const range = parseDateRange(all);
  const performed = range?.start ?? findDates(all)[0] ?? '';
  const month = parseTargetMonth(all);
  return {
    document_type: guessDocumentType(all),
    target_month_text: '',
    target_month: month ? month.slice(0, 7) : '',
    performed_on_text: '',
    performed_on: performed,
    vendor_name: '',
    inspection_type: '',
    pages: pageTexts.map((t, i) => ({ page: i + 1, building_name: '', inspection_type: '', performed_on: findDates(t)[0] ?? '' })),
  };
}

// ---------------------------------------------------------------------------
// 後処理（読み取り結果 → 初期値）
// ---------------------------------------------------------------------------

export interface OcrContext {
  properties: PropertyCandidate[];
  vendors: VendorCandidate[];
  inspectionTypes: string[];
  dictionary: CorrectionDictionary;
  /** ページごとの文字情報（あれば全文フォールバックに使う） */
  pageTexts?: string[];
}

export interface OcrPageSuggestion {
  page: number;
  buildingRead: string;
  property: PropertyMatch | null;
  inspectionTypeRead: string;
  inspectionType: string | null;
  performedOn: string | null;
}

export interface OcrSuggestion {
  documentType: string;
  category: PropertyFileCategory;
  categoryNote: string;
  /** YYYY-MM-01 */
  targetMonth: string | null;
  performedOn: string | null;
  vendorRead: string;
  vendor: VendorCandidate | null;
  inspectionTypeRead: string;
  inspectionType: string | null;
  pages: OcrPageSuggestion[];
  /** 書類全体の物件（ページの中で最も多く当たったもの） */
  property: PropertyMatch | null;
}

function resolveProperty(read: string, pageText: string, ctx: OcrContext): PropertyMatch | null {
  if (read) {
    const fromDict = lookupCorrection(ctx.dictionary, 'property', read);
    const hit = fromDict ? ctx.properties.find((p) => p.code === fromDict) : undefined;
    if (hit) return { ...hit, method: 'dictionary', score: 1 };
    const matched = matchBuildingName(read, ctx.properties);
    if (matched) return matched;
  }
  return pageText ? matchBuildingInText(pageText, ctx.properties) : null;
}

function resolveInspectionType(read: string, ctx: OcrContext): string | null {
  if (!read) return null;
  const fromDict = lookupCorrection(ctx.dictionary, 'inspection_type', read);
  if (fromDict && ctx.inspectionTypes.includes(fromDict)) return fromDict;
  return matchInspectionType(read, ctx.inspectionTypes);
}

export function postProcessOcr(raw: AiOcrRaw, ctx: OcrContext): OcrSuggestion {
  const pageTexts = ctx.pageTexts ?? [];
  const allText = pageTexts.join('\n');
  const targetMonth =
    isoMonthOrNull(raw.target_month) ?? parseTargetMonth(raw.target_month_text) ?? (allText ? parseTargetMonth(allText) : null);
  const performedOn =
    isoDateOrNull(raw.performed_on) ??
    parseDateRange(raw.performed_on_text)?.start ??
    parseJapaneseDate(raw.performed_on_text) ??
    null;

  const vendorFromDict = raw.vendor_name ? lookupCorrection(ctx.dictionary, 'vendor', raw.vendor_name) : null;
  const vendor =
    (vendorFromDict ? ctx.vendors.find((v) => v.id === vendorFromDict) : undefined) ??
    (raw.vendor_name ? matchCompany(raw.vendor_name, ctx.vendors) : null) ??
    (allText ? matchCompanyInText(allText, ctx.vendors) : null);

  const docTypeFromDict = lookupCorrection(ctx.dictionary, 'category', raw.document_type);
  const fromType = categoryOfDocumentType(raw.document_type);
  // 辞書の値は区分の値のときだけ使う（区分でない値で全社の既定を変えない）
  const category = isPropertyFileCategory(docTypeFromDict) ? docTypeFromDict : fromType.category;

  const pageCount = Math.max(raw.pages.length, pageTexts.length);
  const byPage = new Map(raw.pages.map((p) => [p.page, p]));
  const pages: OcrPageSuggestion[] = [];
  for (let i = 1; i <= pageCount; i++) {
    const p = byPage.get(i);
    const buildingRead = p?.building_name ?? '';
    const typeRead = p?.inspection_type || raw.inspection_type || '';
    pages.push({
      page: i,
      buildingRead,
      property: resolveProperty(buildingRead, pageTexts[i - 1] ?? '', ctx),
      inspectionTypeRead: typeRead,
      // 読めなければページの文字に出てくる点検種別名（文字情報だけで読むとき）
      inspectionType:
        resolveInspectionType(typeRead, ctx) ?? matchInspectionTypeInText(pageTexts[i - 1] ?? '', ctx.inspectionTypes),
      performedOn: isoDateOrNull(p?.performed_on ?? '') ?? null,
    });
  }

  const counts = new Map<string, { m: PropertyMatch; n: number }>();
  for (const p of pages) {
    if (!p.property) continue;
    const cur = counts.get(p.property.code);
    counts.set(p.property.code, { m: cur?.m ?? p.property, n: (cur?.n ?? 0) + 1 });
  }
  const property = [...counts.values()].sort((a, b) => b.n - a.n)[0]?.m ?? null;

  return {
    documentType: raw.document_type,
    category,
    categoryNote: category === 'other' ? fromType.note : '',
    targetMonth,
    performedOn,
    vendorRead: raw.vendor_name,
    vendor: vendor ?? null,
    inspectionTypeRead: raw.inspection_type,
    inspectionType: resolveInspectionType(raw.inspection_type, ctx),
    pages,
    property,
  };
}

// ---------------------------------------------------------------------------
// 一括アップロードの区間への割り当て
// ---------------------------------------------------------------------------

/** 区間の割り当てに使う選択肢の最小の形（bulkSegments.BulkTarget と同じ列） */
export interface OcrTargetLike {
  key: string;
  targetMonth: string | null;
  inspection: {
    property_code: string;
    inspection_type_label: string | null;
    vendor_id: string | null;
    unit_vendor_ids: string[];
  };
}

/**
 * 区間（先頭〜末尾ページ）ごとに、読み取った物件・点検種別・対象月・保守会社で選択肢を絞り、1つに決まれば選ぶ。
 * 対象月が読めたら、その月の予定（無ければ点検月未登録の行）を選ぶ。決まらない区間は入れない（人が選ぶ）
 */
export function suggestSegmentTargets<T extends OcrTargetLike>(
  segments: { start: number; end: number }[],
  suggestion: OcrSuggestion,
  targets: T[],
): Record<number, string> {
  const out: Record<number, string> = {};
  for (const seg of segments) {
    const pages = suggestion.pages.filter((p) => p.page - 1 >= seg.start && p.page - 1 <= seg.end);
    const property = pages.find((p) => p.property)?.property ?? (segments.length === 1 ? suggestion.property : null);
    if (!property) continue;
    let pool = targets.filter((t) => t.inspection.property_code === property.code);
    const typeLabel = pages.find((p) => p.inspectionType)?.inspectionType ?? suggestion.inspectionType;
    if (typeLabel) {
      const byType = pool.filter((t) => t.inspection.inspection_type_label === typeLabel);
      if (byType.length > 0) pool = byType;
    }
    if (suggestion.vendor) {
      const id = suggestion.vendor.id;
      const byVendor = pool.filter((t) => t.inspection.vendor_id === id || t.inspection.unit_vendor_ids.includes(id));
      if (byVendor.length > 0) pool = byVendor;
    }
    if (suggestion.targetMonth) {
      const byMonth = pool.filter((t) => t.targetMonth === suggestion.targetMonth);
      pool = byMonth.length > 0 ? byMonth : pool.filter((t) => t.targetMonth === null);
    }
    if (pool.length === 1 && pool[0]) out[seg.start] = pool[0].key;
  }
  return out;
}

/**
 * 建物が変わるページの前に区切りを入れる案（区切りは「そのページの前で切る」0 始まりのページ番号）。
 * 建物を読めなかったページは前のページの建物を引き継ぐ。2つ以上の建物が読めたときだけ区切りが入る
 */
export function suggestBreaks(pages: OcrPageSuggestion[], pageCount: number): Set<number> {
  const breaks = new Set<number>();
  let current: string | null = null;
  for (const p of [...pages].sort((a, b) => a.page - b.page)) {
    const index = p.page - 1;
    if (index >= pageCount) break;
    const code = p.property?.code ?? null;
    if (!code) continue;
    if (current && code !== current && index > 0) breaks.add(index);
    current = code;
  }
  return breaks;
}

/** 先月の末日（YYYY-MM-DD）。today は YYYY-MM-DD */
export function lastDayOfPreviousMonth(today: string): string {
  const y = Number(today.slice(0, 4));
  const m = Number(today.slice(5, 7));
  const d = new Date(Date.UTC(y, m - 1, 0));
  return d.toISOString().slice(0, 10);
}

/**
 * 読み取り結果から、実施日（全区間の既定）に入れる値（修正依頼1025 G3）。実施日が読めたらその日、
 * 読めず対象月が先月なら先月の末日、どちらでもなければ null（今の既定＝今日のまま）
 */
export function suggestedDefaultPerformedOn(
  suggestion: Pick<OcrSuggestion, 'performedOn' | 'targetMonth'>,
  today: string,
): string | null {
  if (suggestion.performedOn) return suggestion.performedOn;
  const lastMonthEnd = lastDayOfPreviousMonth(today);
  if (suggestion.targetMonth && suggestion.targetMonth.slice(0, 7) === lastMonthEnd.slice(0, 7)) return lastMonthEnd;
  return null;
}
