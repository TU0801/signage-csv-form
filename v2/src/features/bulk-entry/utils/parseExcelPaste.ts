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

/** 見出しに無いときに既定の位置で補う列（案内文・表示位置は別扱い） */
const FALLBACK_FIELDS: PasteField[] = ['property', 'terminal', 'inspectionType', 'startDate', 'endDate', 'remarks'];

/**
 * ヘッダー行の見出し名で列を割り当てる。端末ID の列があれば旧6列を既定にし、
 * 見出しに無い列は既定の位置を（他の列と重ならなければ）使う。
 * 案内文・表示位置は、既定の位置に別の見出しがあれば補わない（点検報告書の「保守会社」など知らない見出しの列を表示位置として読まないように）。
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
  for (const field of FALLBACK_FIELDS) {
    const index = base[field];
    if (index !== undefined && map[field] === undefined && !used.has(index)) map[field] = index;
  }
  // 案内文・表示位置は、既定の位置に見出しが何も無い（見出し行が5列で止まっている）ときだけ既定の位置で読む
  for (const field of ['noticeText', 'position'] as const) {
    const index = base[field];
    if (index !== undefined && map[field] === undefined && !used.has(index) && !(headerCols[index]?.trim())) map[field] = index;
  }
  return map;
}

const looksLikeDate = (s: string | undefined) => formatDateForInput(s?.trim() || '') !== '';

/**
 * ヘッダーが無いときの形式の推定。最初に見分けのつく行で決める:
 * - cols[1] がマスターにある端末ID → 旧6列（日付が1つも無い行でも見分けられる）
 * - cols[1] が日付でなく cols[2] が日付 → 新5列
 * - cols[4] が日付 → 旧6列（新5列では cols[4] は備考。旧6列で点検種別か開始日が空の行もここで拾う）
 * - cols[3] が日付で、cols[2] が日付でない文字（点検種別）→ 旧6列
 * どの行でも決まらなければ新5列（今のテンプレート書式）。
 * 新5列で開始日が空・終了日だけの行（cols[3] だけが日付）は cols[2] が空なので旧6列とはみなさない。
 */
function detectLayout(lines: string[][], terminalIds: Set<string>): ColumnMap {
  for (const cols of lines) {
    const c1 = cols[1]?.trim() || '';
    if (c1 !== '' && terminalIds.has(c1)) return LEGACY_LAYOUT;
    if (!looksLikeDate(cols[1]) && looksLikeDate(cols[2])) return NEW_LAYOUT;
    if (looksLikeDate(cols[4])) return LEGACY_LAYOUT;
    const c2 = cols[2]?.trim() || '';
    if (looksLikeDate(cols[3]) && c2 !== '' && !looksLikeDate(c2)) return LEGACY_LAYOUT;
  }
  return NEW_LAYOUT;
}

/** 表示位置の値（0〜4。rowDetail.ts POSITIONS）。数でない・範囲外は既定の 2（②上中） */
function parsePosition(raw: string | undefined): number {
  const n = parseInt(raw?.trim() || '', 10);
  return Number.isFinite(n) && n >= 0 && n <= 4 ? n : 2;
}

export interface PasteResult {
  rows: BulkRowInput[];
  /** 物件名・物件コードがマスターに無かった行の数（行は物件エラーで残す） */
  unresolvedCount: number;
  /** マスターに無かった物件名（貼り付けた文字のまま。重複は1つにまとめる） */
  unresolvedNames: string[];
  /** 物件・端末・点検種別がどれも無く、空白でもない行の数（飛ばす） */
  errorCount: number;
  /**
   * 新5列で、開始日・終了日・備考・案内文がどれも空の行の数（飛ばす）。一括入力テンプレートは担当の物件を全部並べるので、
   * 日付を入れなかった物件の行は取り込まない（修正依頼1027 (2)）。旧6列（v1 互換）は今までどおり取り込む
   */
  blankCount: number;
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
  const lines = splitTsv(raw);
  while (lines.length > 0 && lines[lines.length - 1]!.every((c) => c.trim() === '')) lines.pop();

  let startIndex = 0;
  const firstCols = lines[0] || [];
  const firstColLower = (firstCols[0] || '').toLowerCase().trim();
  const secondColLower = (firstCols[1] || '').toLowerCase().trim();
  const isHeaderRow = HEADER_KEYWORDS.some(
    (keyword) => firstColLower === keyword.toLowerCase() || secondColLower === keyword.toLowerCase(),
  );
  if (isHeaderRow) startIndex = 1;
  const terminalIds = new Set(properties.map((p) => p.terminalId).filter((t) => t !== ''));
  const columns = isHeaderRow ? columnsFromHeader(firstCols) : detectLayout(lines, terminalIds);
  const cell = (cols: string[], field: PasteField): string => {
    const index = columns[field];
    return index === undefined ? '' : cols[index]?.trim() || '';
  };

  const rows: BulkRowInput[] = [];
  let errorCount = 0;
  let unresolvedCount = 0;
  let blankCount = 0;
  const unresolvedNames: string[] = [];

  for (let i = startIndex; i < lines.length; i++) {
    const cols = lines[i]!;
    const propValue = cell(cols, 'property');
    const terminalId = cell(cols, 'terminal');
    const inspectionType = cell(cols, 'inspectionType');

    if (!propValue && !terminalId && !inspectionType) {
      if (cols.some((c) => c.trim() !== '')) errorCount++;
      continue;
    }
    // 新5列で入力する欄がどれも空の行（テンプレートで日付を入れなかった物件）は飛ばす
    if (
      columns.terminal === undefined &&
      !cell(cols, 'startDate') &&
      !cell(cols, 'endDate') &&
      !cell(cols, 'remarks') &&
      !cell(cols, 'noticeText')
    ) {
      blankCount++;
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

    rows.push({
      propertyCode: property?.propertyCode || '',
      ...(unresolved ? { pastedPropertyName: propValue } : {}),
      terminalId,
      inspectionType,
      startDate: formatDateForInput(cell(cols, 'startDate')),
      endDate: formatDateForInput(cell(cols, 'endDate')),
      remarks: cell(cols, 'remarks'),
      noticeText: cell(cols, 'noticeText'),
      position: parsePosition(cell(cols, 'position')),
    });
  }

  return { rows, unresolvedCount, unresolvedNames, errorCount, blankCount };
}

const isBreak = (ch: string | undefined) => ch === '\t' || ch === '\n' || ch === '\r';

/**
 * タブ区切りのテキストを行・セルに分ける。Excel のコピーと同じく、改行・タブ・" を含むセルは "…" で囲み、中の " は "" にしたものとして読む
 * （備考を2行にしたセルを貼っても行がずれない）。閉じの " の直後がタブ・改行・終わりでなければ囲みとみなさず、" はそのままの文字
 */
export function splitTsv(raw: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let i = 0;
  const n = raw.length;
  for (;;) {
    let value: string | null = null;
    if (raw[i] === '"') {
      let j = i + 1;
      let text = '';
      while (j < n) {
        if (raw[j] === '"') {
          if (raw[j + 1] === '"') {
            text += '"';
            j += 2;
            continue;
          }
          if (j + 1 >= n || isBreak(raw[j + 1])) value = text.replace(/\r\n/g, '\n');
          break;
        }
        text += raw[j];
        j++;
      }
      if (value !== null) i = j + 1;
    }
    if (value === null) {
      const start = i;
      while (i < n && !isBreak(raw[i])) i++;
      value = raw.slice(start, i);
    }
    row.push(value);
    if (i >= n) {
      rows.push(row);
      return rows;
    }
    if (raw[i] === '\t') {
      i++;
      continue;
    }
    i += raw[i] === '\r' && raw[i + 1] === '\n' ? 2 : 1;
    rows.push(row);
    row = [];
    if (i >= n) return rows;
  }
}

/** TSV の1セル（改行・タブ・" を含むときは Excel のコピーと同じく "…" で囲む） */
function tsvCell(value: string): string {
  return /[\t\n\r"]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

/** SheetJS のセル（使う項目だけ） */
interface SheetCell {
  t: string;
  v?: unknown;
  w?: string;
  z?: string | number;
}

/**
 * Excel ファイル（.xlsx など）の最初のシートを、貼り付けと同じタブ区切りのテキストにする（修正依頼1027 (2)）。
 * 日付のセルは表示の書式に関わらず YYYY/M/D にする（formatDateForInput が読める形）。
 * 一括入力テンプレートの隠しシート（点検種別の選択肢）は2枚目なので読まない
 */
export async function excelFileToTsv(data: ArrayBuffer): Promise<string> {
  const XLSX = await import('xlsx');
  const wb = XLSX.read(data, { type: 'array', cellNF: true });
  const ws = wb.Sheets[wb.SheetNames[0] ?? ''];
  if (!ws || !ws['!ref']) return '';
  const range = XLSX.utils.decode_range(ws['!ref']);
  const lines: string[] = [];
  for (let r = range.s.r; r <= range.e.r; r++) {
    const cells: string[] = [];
    for (let c = range.s.c; c <= range.e.c; c++) {
      const cellObj = ws[XLSX.utils.encode_cell({ r, c })] as SheetCell | undefined;
      let text = '';
      if (cellObj && cellObj.v !== undefined && cellObj.v !== null) {
        if (cellObj.t === 'n' && cellObj.z !== undefined && XLSX.SSF.is_date(cellObj.z)) {
          const d = XLSX.SSF.parse_date_code(Number(cellObj.v));
          text = `${d.y}/${d.m}/${d.d}`;
        } else {
          text = cellObj.t === 's' ? String(cellObj.v) : (cellObj.w ?? String(cellObj.v));
        }
      }
      cells.push(tsvCell(text));
    }
    lines.push(cells.join('\t'));
  }
  return lines.join('\n');
}

/** 取込の説明（Excelから取込の「列の順序」）に出す例の行（備考は作業時間の書き方の例） */
export const PASTE_TEMPLATE_EXAMPLES: string[][] = [
  ['アソシアグロッツォ天神サウス', 'エレベーター定期点検', '2025/1/15', '2025/1/15', '10:00～12:00'],
  ['アソシアグロッツォタイムズスイート博多', '消防設備点検', '2025/2/1', '2025/2/3', 'No2号機11:00～12:00'],
];
