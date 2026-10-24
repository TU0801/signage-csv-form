import type { BulkProperty, BulkRowInput } from '../types';

/**
 * 貼り付けの列（5列。1024 で端末ID を外した）。テンプレート書式（xlsx）とヘルプ表示もこの順。
 * 見出し名は CSV・取込のタイトル行名と同じ（「備考」のまま）。
 */
export const PASTE_COLUMNS = ['物件名', '点検種別', '開始日', '終了日', '備考'] as const;

/** 旧6列（v1.29.2〜1024 まで）。B列が端末ID。取込だけ互換で読む */
export const LEGACY_PASTE_COLUMNS = ['物件名', '端末ID', '点検種別', '開始日', '終了日', '備考'] as const;

/** 先頭行をヘッダーとみなす語（1列目か2列目が一致したら飛ばす） */
const HEADER_KEYWORDS = ['物件コード', '物件名', '物件', 'property', '端末id', '端末', 'terminal', '保守会社', '業者', 'vendor', '点検種別'];

type PasteField = 'property' | 'terminal' | 'inspectionType' | 'startDate' | 'endDate' | 'remarks' | 'noticeText' | 'position';
type ColumnMap = Partial<Record<PasteField, number>>;

/** 新5列の位置（6・7列目に案内文・表示位置があれば読む） */
const NEW_LAYOUT: ColumnMap = { property: 0, inspectionType: 1, startDate: 2, endDate: 3, remarks: 4, noticeText: 5, position: 6 };
/** 旧6列の位置（7・8列目に案内文・表示位置があれば読む。v1 importFromPaste と同じ） */
const LEGACY_LAYOUT: ColumnMap = { property: 0, terminal: 1, inspectionType: 2, startDate: 3, endDate: 4, remarks: 5, noticeText: 6, position: 7 };

/** 見出し名 → 列の意味（小文字・空白抜きで比べる） */
const HEADER_FIELDS: Array<[PasteField, string[]]> = [
  ['property', ['物件名', '物件コード', '物件', 'property']],
  ['terminal', ['端末id', '端末', 'terminal']],
  ['inspectionType', ['点検種別', '点検']],
  ['startDate', ['開始日', '点検開始日']],
  ['endDate', ['終了日', '点検終了日']],
  ['remarks', ['備考', '作業時間及び備考']],
  ['noticeText', ['案内文']],
  ['position', ['表示位置']],
];

const normalizeHeader = (s: string) => s.toLowerCase().replace(/\s+/g, '');

/**
 * ヘッダー行の見出し名で列を割り当てる。端末ID の列があれば旧6列を既定にし、
 * 見出しに無い列は既定の位置を（他の列と重ならなければ）使う。
 */
function columnsFromHeader(headerCols: string[]): ColumnMap {
  const named: ColumnMap = {};
  headerCols.forEach((cell, index) => {
    const key = normalizeHeader(cell);
    if (!key) return;
    const hit = HEADER_FIELDS.find(([, names]) => names.includes(key));
    if (hit && named[hit[0]] === undefined) named[hit[0]] = index;
  });
  const base = named.terminal !== undefined ? LEGACY_LAYOUT : NEW_LAYOUT;
  const used = new Set(Object.values(named));
  const map: ColumnMap = { ...named };
  for (const [field, index] of Object.entries(base) as Array<[PasteField, number]>) {
    if (map[field] === undefined && !used.has(index)) map[field] = index;
  }
  return map;
}

const looksLikeDate = (s: string | undefined) => formatDateForInput(s?.trim() || '') !== '';

/**
 * ヘッダーが無いときの形式の推定。最初に見分けのつく行で決める:
 * - cols[1] が日付でなく cols[2] が日付 → 新5列
 * - cols[3] が日付で、cols[2] が日付でない文字（点検種別）→ 旧6列
 * どの行でも決まらなければ新5列（今のテンプレート書式）。
 * 新5列で開始日が空・終了日だけの行（cols[3] だけが日付）は cols[2] が空なので旧6列とはみなさない。
 */
function detectLayout(lines: string[]): ColumnMap {
  for (const line of lines) {
    const cols = line.split('\t');
    if (!looksLikeDate(cols[1]) && looksLikeDate(cols[2])) return NEW_LAYOUT;
    const c2 = cols[2]?.trim() || '';
    if (looksLikeDate(cols[3]) && c2 !== '' && !looksLikeDate(c2)) return LEGACY_LAYOUT;
  }
  return NEW_LAYOUT;
}

export interface PasteResult {
  rows: BulkRowInput[];
  /** 物件名・物件コードがマスターに無かった行の数（行は物件エラーで残す） */
  unresolvedCount: number;
  /** マスターに無かった物件名（貼り付けた文字のまま。重複は1つにまとめる） */
  unresolvedNames: string[];
  /** 物件・端末・点検種別がどれも無く、空白でもない行の数（飛ばす） */
  errorCount: number;
}

/** YYYY/M/D・YYYY-M-D を YYYY-MM-DD にする。読めなければ空。v1: js/bulk-modals.js formatDateForInput */
export function formatDateForInput(dateStr: string): string {
  if (!dateStr) return '';
  const match = dateStr.match(/(\d{4})[/-](\d{1,2})[/-](\d{1,2})/);
  if (match) {
    return `${match[1]}-${match[2]!.padStart(2, '0')}-${match[3]!.padStart(2, '0')}`;
  }
  return '';
}

/**
 * Excel から貼り付けたタブ区切りテキストを行にする。
 * 列は新5列（物件名/物件コード, 点検種別, 開始日, 終了日, 備考。6・7列目に案内文・表示位置があれば読む）。
 * 旧6列（B列が端末ID）も読む: ヘッダー行があれば見出し名で列を割り当て、無ければ日付の位置で見分ける。
 * - 全体を trim しない（先頭セルが空の行で列がずれないように）。末尾の空行だけ落とす
 * - 物件は名前とコードの両方で照合し、見つからなければ空にして行は残す（黙って取り込まない）。
 *   貼り付けた物件名は pastedPropertyName に残し、画面で直すときに使う
 * - 端末ID が無い（新5列）ときは空で渡し、addRow が物件の最初の端末を入れる
 * v1: js/bulk-modals.js importFromPaste（旧6列）
 */
export function parseExcelPaste(raw: string, properties: BulkProperty[]): PasteResult {
  const lines = raw.split(/\r?\n/);
  while (lines.length > 0 && lines[lines.length - 1]!.trim() === '') lines.pop();

  let startIndex = 0;
  const firstCols = (lines[0] || '').split('\t');
  const firstColLower = (firstCols[0] || '').toLowerCase().trim();
  const secondColLower = (firstCols[1] || '').toLowerCase().trim();
  const isHeaderRow = HEADER_KEYWORDS.some(
    (keyword) => firstColLower === keyword.toLowerCase() || secondColLower === keyword.toLowerCase(),
  );
  if (isHeaderRow) startIndex = 1;
  const columns = isHeaderRow ? columnsFromHeader(firstCols) : detectLayout(lines);
  const cell = (cols: string[], field: PasteField): string => {
    const index = columns[field];
    return index === undefined ? '' : cols[index]?.trim() || '';
  };

  const rows: BulkRowInput[] = [];
  let errorCount = 0;
  let unresolvedCount = 0;
  const unresolvedNames: string[] = [];

  for (let i = startIndex; i < lines.length; i++) {
    const line = lines[i]!;
    const cols = line.split('\t');
    const propValue = cell(cols, 'property');
    const terminalId = cell(cols, 'terminal');
    const inspectionType = cell(cols, 'inspectionType');

    if (!propValue && !terminalId && !inspectionType) {
      if (line.trim() !== '') errorCount++;
      continue;
    }

    const property = properties.find(
      (p) => p.propertyName === propValue || String(p.propertyCode) === String(propValue),
    );
    const unresolved = !property && !!propValue;
    if (unresolved) {
      unresolvedCount++;
      if (!unresolvedNames.includes(propValue)) unresolvedNames.push(propValue);
    }

    const positionIndex = columns.position;
    const positionRaw = positionIndex === undefined ? undefined : cols[positionIndex];
    rows.push({
      propertyCode: property?.propertyCode || '',
      ...(unresolved ? { pastedPropertyName: propValue } : {}),
      terminalId,
      inspectionType,
      startDate: formatDateForInput(cell(cols, 'startDate')),
      endDate: formatDateForInput(cell(cols, 'endDate')),
      remarks: cell(cols, 'remarks'),
      noticeText: cell(cols, 'noticeText'),
      position: positionRaw ? parseInt(positionRaw) : 2,
    });
  }

  return { rows, unresolvedCount, unresolvedNames, errorCount };
}

/** テンプレート書式の例の行（備考は作業時間の書き方の例） */
export const PASTE_TEMPLATE_EXAMPLES: string[][] = [
  ['アソシアグロッツォ天神サウス', 'エレベーター定期点検', '2025/1/15', '2025/1/15', '10:00～12:00'],
  ['アソシアグロッツォタイムズスイート博多', '消防設備点検', '2025/2/1', '2025/2/3', 'No2号機11:00～12:00'],
];

/** テンプレート書式のシート（見出し1行 + 例2行）。日付は formatDateForInput が読める YYYY/M/D の文字列 */
export function buildPasteTemplateSheet(): string[][] {
  return [[...PASTE_COLUMNS], ...PASTE_TEMPLATE_EXAMPLES.map((r) => [...r])];
}

/**
 * テンプレート書式（一括入力テンプレート.xlsx）をダウンロードする。
 * v1: js/bulk-modals.js downloadExcelTemplate（v1 は CSV・6列）
 */
export async function downloadPasteTemplate(): Promise<void> {
  const XLSX = await import('xlsx');
  const ws = XLSX.utils.aoa_to_sheet(buildPasteTemplateSheet());
  ws['!cols'] = [
    { wch: 36 }, // 物件名
    { wch: 22 }, // 点検種別
    { wch: 12 }, // 開始日
    { wch: 12 }, // 終了日
    { wch: 30 }, // 備考
  ];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, '一括入力');
  XLSX.writeFile(wb, '一括入力テンプレート.xlsx');
}
