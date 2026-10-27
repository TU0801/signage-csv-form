import { PASTE_COLUMNS } from './parseExcelPaste';

/*
 * 一括入力テンプレート（Excel）。修正依頼1027 (2)
 * - 見本の行は入れず、ログインした保守会社（管理者は選んだ保守会社）の点検が登録されている物件を全部入れる（1物件1行）
 * - 1行目（見出し）は背景グレー・文字白、表全体に罫線、開始日・終了日・備考の2行目以降は薄いグレー（入力する欄）
 * - 点検種別はその物件のその保守会社の点検種別。既定は業務システムの「設備」の1番上、複数あればセルのプルダウン（入力規則）で選べる
 * - ファイル名は YYYYMMDD_保守会社の略称_一括点検日入力テンプレート.xlsx（ダウンロードした日・日本時間）
 * 列は Excel 取込（parseExcelPaste の新5列）と同じなので、そのまま貼り付けても、ファイルを選んでも取り込める。
 * xlsx（SheetJS 無償版）は書式・入力規則を書けないので、OOXML を直接組んで jszip で固める。
 */

/** テンプレートの1行（1物件） */
export interface TemplateRow {
  propertyName: string;
  /** その物件のその保守会社の点検種別（先頭が既定） */
  types: string[];
}

/** テンプレートの行を作るための点検行（portal_inspections の一部） */
export interface TemplateInspection {
  inspection_id: string;
  property_code: string;
  property_name: string;
  inspection_type_label: string | null;
}

/**
 * 点検行を物件ごとの行にする。物件は物件コード順、点検種別は order（業務システムの設備の並びの点検行 id）の順で、
 * order に無いものは後ろ（名前の順）。同じ点検種別は1つにまとめる
 */
export function buildTemplateRows(inspections: TemplateInspection[], order: readonly string[] = []): TemplateRow[] {
  const rank = new Map(order.map((id, i) => [id, i]));
  const byProperty = new Map<string, { name: string; items: TemplateInspection[] }>();
  for (const i of inspections) {
    const label = i.inspection_type_label?.trim();
    if (!label) continue;
    const group = byProperty.get(i.property_code) ?? { name: i.property_name, items: [] };
    group.items.push(i);
    byProperty.set(i.property_code, group);
  }
  return [...byProperty.entries()]
    .sort(([a], [b]) => a.localeCompare(b, 'ja', { numeric: true }))
    .map(([, g]) => {
      const sorted = [...g.items].sort((a, b) => {
        const ra = rank.get(a.inspection_id) ?? Number.MAX_SAFE_INTEGER;
        const rb = rank.get(b.inspection_id) ?? Number.MAX_SAFE_INTEGER;
        return ra - rb || (a.inspection_type_label ?? '').localeCompare(b.inspection_type_label ?? '', 'ja');
      });
      return { propertyName: g.name, types: [...new Set(sorted.map((i) => i.inspection_type_label!.trim()))] };
    });
}

/** ファイル名（today は YYYY-MM-DD の日本時間の日付）。ファイル名に使えない文字は全角の「＿」にする */
export function templateFilename(shortName: string, today: string): string {
  const name = (shortName.trim() || '保守会社').replace(/[\\/:*?"<>|\s]+/g, '＿');
  return `${today.replace(/-/g, '')}_${name}_一括点検日入力テンプレート.xlsx`;
}

const xmlEscape = (s: string) =>
  s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    // XML 1.0 で使えない制御文字は落とす（タブ・改行は残す）
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '');

/** 列番号（0 始まり）→ 列の文字（A, B, …, Z, AA, …） */
function colName(index: number): string {
  let n = index + 1;
  let s = '';
  while (n > 0) {
    const m = (n - 1) % 26;
    s = String.fromCharCode(65 + m) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
}

/** 文字のセル（共有文字列を使わず inlineStr で入れる） */
const strCell = (ref: string, style: number, value: string) =>
  value === ''
    ? `<c r="${ref}" s="${style}"/>`
    : `<c r="${ref}" s="${style}" t="inlineStr"><is><t xml:space="preserve">${xmlEscape(value)}</t></is></c>`;

/** 選択肢を置く隠しシートの名前 */
export const TEMPLATE_LIST_SHEET = '点検種別の選択肢';
/** 入力するシートの名前 */
export const TEMPLATE_SHEET = '一括入力';

/** スタイルの番号（styles.xml の cellXfs の並び） */
const STYLE = { header: 1, body: 2, date: 3, input: 4 } as const;

const STYLES_XML = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
<numFmts count="1"><numFmt numFmtId="164" formatCode="yyyy/m/d"/></numFmts>
<fonts count="2">
<font><sz val="11"/><name val="游ゴシック"/><family val="3"/><charset val="128"/></font>
<font><b/><sz val="11"/><color rgb="FFFFFFFF"/><name val="游ゴシック"/><family val="3"/><charset val="128"/></font>
</fonts>
<fills count="4">
<fill><patternFill patternType="none"/></fill>
<fill><patternFill patternType="gray125"/></fill>
<fill><patternFill patternType="solid"><fgColor rgb="FF808080"/><bgColor indexed="64"/></patternFill></fill>
<fill><patternFill patternType="solid"><fgColor rgb="FFEDEDED"/><bgColor indexed="64"/></patternFill></fill>
</fills>
<borders count="2">
<border><left/><right/><top/><bottom/><diagonal/></border>
<border><left style="thin"><color auto="1"/></left><right style="thin"><color auto="1"/></right><top style="thin"><color auto="1"/></top><bottom style="thin"><color auto="1"/></bottom><diagonal/></border>
</borders>
<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>
<cellXfs count="5">
<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>
<xf numFmtId="0" fontId="1" fillId="2" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center"/></xf>
<xf numFmtId="0" fontId="0" fillId="0" borderId="1" xfId="0" applyBorder="1" applyAlignment="1"><alignment vertical="center"/></xf>
<xf numFmtId="164" fontId="0" fillId="3" borderId="1" xfId="0" applyNumberFormat="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment vertical="center"/></xf>
<xf numFmtId="0" fontId="0" fillId="3" borderId="1" xfId="0" applyFill="1" applyBorder="1" applyAlignment="1"><alignment vertical="center" wrapText="1"/></xf>
</cellXfs>
<cellStyles count="1"><cellStyle name="標準" xfId="0" builtinId="0"/></cellStyles>
</styleSheet>`;

/** 列幅（物件名・点検種別・開始日・終了日・備考） */
const COL_WIDTHS = [36, 24, 12, 12, 36];

function mainSheetXml(rows: TemplateRow[]): string {
  const header = `<row r="1">${PASTE_COLUMNS.map((h, i) => strCell(`${colName(i)}1`, STYLE.header, h)).join('')}</row>`;
  const body = rows
    .map((r, i) => {
      const n = i + 2;
      return (
        `<row r="${n}">` +
        strCell(`A${n}`, STYLE.body, r.propertyName) +
        strCell(`B${n}`, STYLE.body, r.types[0] ?? '') +
        `<c r="C${n}" s="${STYLE.date}"/><c r="D${n}" s="${STYLE.date}"/><c r="E${n}" s="${STYLE.input}"/>` +
        `</row>`
      );
    })
    .join('');
  // 点検種別が2つ以上の行は、隠しシートのその行（物件の点検種別）をプルダウンの選択肢にする
  const validations = rows
    .map((r, i) => ({ r, i }))
    .filter(({ r }) => r.types.length > 1)
    .map(
      ({ r, i }) =>
        `<dataValidation type="list" allowBlank="1" showInputMessage="1" showErrorMessage="1" ` +
        `errorTitle="点検種別" error="一覧から選んでください" sqref="B${i + 2}">` +
        `<formula1>'${TEMPLATE_LIST_SHEET}'!$A$${i + 1}:$${colName(r.types.length - 1)}$${i + 1}</formula1></dataValidation>`,
    );
  const lastRow = rows.length + 1;
  return (
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">` +
    `<dimension ref="A1:E${lastRow}"/>` +
    `<sheetViews><sheetView workbookViewId="0" tabSelected="1"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>` +
    `<sheetFormatPr defaultRowHeight="18"/>` +
    `<cols>${COL_WIDTHS.map((w, i) => `<col min="${i + 1}" max="${i + 1}" width="${w}" customWidth="1"/>`).join('')}</cols>` +
    `<sheetData>${header}${body}</sheetData>` +
    (validations.length > 0 ? `<dataValidations count="${validations.length}">${validations.join('')}</dataValidations>` : '') +
    `<pageMargins left="0.7" right="0.7" top="0.75" bottom="0.75" header="0.3" footer="0.3"/>` +
    `</worksheet>`
  );
}

function listSheetXml(rows: TemplateRow[]): string {
  const data = rows
    .map((r, i) => {
      const n = i + 1;
      return `<row r="${n}">${r.types.map((t, j) => strCell(`${colName(j)}${n}`, 0, t)).join('')}</row>`;
    })
    .join('');
  return (
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">` +
    `<sheetData>${data}</sheetData></worksheet>`
  );
}

/** テンプレートの xlsx（バイト列）を作る */
export async function buildTemplateXlsx(rows: TemplateRow[]): Promise<Uint8Array> {
  const JSZip = (await import('jszip')).default;
  const zip = new JSZip();
  zip.file(
    '[Content_Types].xml',
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
      `<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">` +
      `<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>` +
      `<Default Extension="xml" ContentType="application/xml"/>` +
      `<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>` +
      `<Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>` +
      `<Override PartName="/xl/worksheets/sheet2.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>` +
      `<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>` +
      `</Types>`,
  );
  zip.file(
    '_rels/.rels',
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
      `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
      `<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>` +
      `</Relationships>`,
  );
  zip.file(
    'xl/workbook.xml',
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
      `<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">` +
      `<bookViews><workbookView activeTab="0"/></bookViews>` +
      `<sheets><sheet name="${TEMPLATE_SHEET}" sheetId="1" r:id="rId1"/>` +
      `<sheet name="${TEMPLATE_LIST_SHEET}" sheetId="2" state="hidden" r:id="rId2"/></sheets>` +
      `</workbook>`,
  );
  zip.file(
    'xl/_rels/workbook.xml.rels',
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
      `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
      `<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>` +
      `<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet2.xml"/>` +
      `<Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>` +
      `</Relationships>`,
  );
  zip.file('xl/styles.xml', STYLES_XML);
  zip.file('xl/worksheets/sheet1.xml', mainSheetXml(rows));
  zip.file('xl/worksheets/sheet2.xml', listSheetXml(rows));
  return zip.generateAsync({ type: 'uint8array', compression: 'DEFLATE' });
}

/** テンプレートをダウンロードする */
export async function downloadTemplateXlsx(rows: TemplateRow[], filename: string): Promise<void> {
  const [bytes, { saveAs }] = await Promise.all([buildTemplateXlsx(rows), import('file-saver')]);
  saveAs(
    new Blob([bytes as BlobPart], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }),
    filename,
  );
}
