import type { BulkEntryRow, BulkNotice, BulkProperty, BulkSettings } from '../types';

/**
 * 行のエラー一覧（空なら有効）。保守会社は画面上部で決まるのでチェックしない。
 * 物件はマスターに実在するコードであることを求める（貼り付けで生値が入っても弾く）。
 * 点検種別もマスターに無ければ「点検種別(未登録)」にする（貼り付けの表記ゆれのまま申請すると、
 * テンプレートNo・案内文が空で登録されるため）。notices が空（読み込み前）のときは照合しない。
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
  > &
    Partial<Pick<BulkEntryRow, 'posterType' | 'posterImage'>>,
  properties: BulkProperty[],
  settings: BulkSettings,
  notices: BulkNotice[] = [],
): string[] {
  const errors: string[] = [];

  const propExists =
    !!row.propertyCode && properties.some((p) => String(p.propertyCode) === String(row.propertyCode));
  if (!propExists) errors.push('物件');
  if (!row.inspectionType) errors.push('点検種別');
  else if (notices.length > 0 && !notices.some((n) => n.inspectionType === row.inspectionType)) {
    errors.push('点検種別(未登録)');
  }
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

  // 備考の行数・1行の文字数は目安で、超えても申請は止めない（入力欄の下に注意を出す。修正依頼1026 I8。lib/remarks）

  if (row.noticeText) {
    const noticeTextMaxChars = Number(settings.notice_text_max_chars || 200);
    if (row.noticeText.length > noticeTextMaxChars) {
      errors.push(`案内文(${noticeTextMaxChars}文字以下)`);
    }
  }

  // 追加の貼紙は画像が要る（詳細設定で選ぶ。B18）
  if (row.posterType === 'custom' && !row.posterImage) errors.push('貼紙画像');

  return errors;
}
