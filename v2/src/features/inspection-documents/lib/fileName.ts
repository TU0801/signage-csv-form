/*
 * 点検報告書のファイル名。DocFlow（backend/shared/ocr_service.py FileNameGenerator）と同じ規則:
 * 「実施日(YYYYMMDD)_建物名_点検種別.pdf」、禁止文字（<>:"/\|?* と制御文字）と空白を除き、全角数字を半角にし、
 * 項目ごとに50文字で切る。OCR は使わないので、建物名・点検種別は選んだ点検から、実施日は入力から取る。
 */

const MAX_PART_LENGTH = 50;

export function sanitizeFileNamePart(value: string): string {
  return Array.from(
    value
      .replace(/[０-９]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xfee0))
      // eslint-disable-next-line no-control-regex
      .replace(/[<>:"/\\|?*\u0000-\u001f\u007f]/g, '')
      .replace(/[\s\u3000]+/g, ''),
  )
    .slice(0, MAX_PART_LENGTH)
    .join('');
}

export interface ReportFileNameParts {
  /** 実施日（YYYY-MM-DD） */
  performedOn: string;
  propertyName: string;
  inspectionTypeLabel: string;
}

export function buildReportFileName({ performedOn, propertyName, inspectionTypeLabel }: ReportFileNameParts): string {
  const date = performedOn.replace(/-/g, '');
  const parts = [date, sanitizeFileNamePart(propertyName) || '未設定', sanitizeFileNamePart(inspectionTypeLabel) || '点検'];
  return `${parts.join('_')}.pdf`;
}

/** 利用者が直した表示名を保存できる形にそろえる（禁止文字を除き、.pdf を付ける） */
export function normalizeEditedFileName(name: string): string {
  const base = name.replace(/\.pdf$/i, '');
  const cleaned = Array.from(
    base
      // eslint-disable-next-line no-control-regex
      .replace(/[<>:"/\\|?*\u0000-\u001f\u007f]/g, '')
      .trim(),
  )
    .slice(0, 150)
    .join('');
  return cleaned ? `${cleaned}.pdf` : '';
}
