import type { BulkEntryRow, BulkProperty, BulkSettings } from '../types';

/**
 * 行のエラー一覧（空なら有効）。保守会社は画面上部で決まるのでチェックしない。
 * 物件はマスターに実在するコードであることを求める（貼り付けで生値が入っても弾く）。
 * v1: js/bulk-table.js validateRow
 */
export function validateBulkRow(
  row: Pick<
    BulkEntryRow,
    | 'propertyCode'
    | 'terminalId'
    | 'inspectionType'
    | 'startDate'
    | 'endDate'
    | 'displayStartDate'
    | 'displayEndDate'
    | 'displayTime'
    | 'remarks'
    | 'noticeText'
  >,
  properties: BulkProperty[],
  settings: BulkSettings,
): string[] {
  const errors: string[] = [];

  const propExists =
    !!row.propertyCode && properties.some((p) => String(p.propertyCode) === String(row.propertyCode));
  if (!propExists) errors.push('物件');
  if (!row.inspectionType) errors.push('点検種別');
  if (propExists && !row.terminalId) errors.push('端末');

  if (row.startDate && row.endDate && row.startDate > row.endDate) {
    errors.push('点検終了日は開始日以降');
  }
  if (row.displayStartDate && row.displayEndDate && row.displayStartDate > row.displayEndDate) {
    errors.push('表示終了日は開始日以降');
  }

  const displayTimeMax = Number(settings.display_time_max || 30);
  if (row.displayTime && row.displayTime > displayTimeMax) {
    errors.push(`表示時間(${displayTimeMax}秒以下)`);
  }

  if (row.remarks) {
    const remarksMaxLines = Number(settings.remarks_max_lines || 5);
    const remarksCharsPerLine = Number(settings.remarks_chars_per_line || 25);
    const lines = row.remarks.split('\n');
    if (lines.length > remarksMaxLines) {
      errors.push(`備考行数(${remarksMaxLines}行以下)`);
    }
    if (lines.some((line) => line.length > remarksCharsPerLine)) {
      errors.push(`備考文字数(1行${remarksCharsPerLine}文字以下)`);
    }
  }

  if (row.noticeText) {
    const noticeTextMaxChars = Number(settings.notice_text_max_chars || 200);
    if (row.noticeText.length > noticeTextMaxChars) {
      errors.push(`案内文(${noticeTextMaxChars}文字以下)`);
    }
  }

  return errors;
}
