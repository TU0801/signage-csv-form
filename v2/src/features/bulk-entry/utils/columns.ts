import type { BulkEntryRow } from '../types';

/**
 * セル内の入力欄の列番号（Enter で次の列へ、Alt+↑↓ で同じ列の前後の行へ）。data-col に入れる。
 * 点検予定の行は物件・点検種別が読み取りなので入力欄が無く、Enter は次にある入力欄へ移る。
 * 詳細ボタンは Enter の移動先にしない（申請時のエラーの移動先にだけ使う）
 */
export const COL = { property: 0, inspection: 1, startDate: 2, endDate: 3, remarks: 4, memo: 5, detail: 6 } as const;
export const LAST_INPUT_COL = COL.memo;

/** エラーの文言（validateBulkRow の先頭の語）→ そのエラーを直す欄。端末は列を外したので物件の欄（物件の下にエラーを出す。B7・B8） */
const ERROR_COL: { prefix: string; col: number }[] = [
  { prefix: '物件', col: COL.property },
  { prefix: '端末', col: COL.property },
  { prefix: '点検種別', col: COL.inspection },
  { prefix: '点検終了日', col: COL.endDate },
  { prefix: '備考', col: COL.remarks },
  { prefix: '表示', col: COL.detail },
  { prefix: '案内文', col: COL.detail },
];

/** トーストに出すエラーの説明（validateBulkRow の短い文言を読める形にする） */
export function errorLabel(error: string): string {
  switch (error) {
    case '物件':
      return '物件を選択してください';
    case '端末':
      return '端末未設置の物件です（この物件には端末が登録されていません）';
    case '点検種別':
      return '点検種別を選択してください';
    case '点検種別(未登録)':
      return '点検種別がマスターにありません';
    default:
      return error;
  }
}

export function errorCol(error: string): number {
  return ERROR_COL.find((e) => error.startsWith(e.prefix))?.col ?? COL.property;
}

/** 申請対象の行のうち最初のエラー（表の並び順）。無ければ null */
export function firstError(rows: BulkEntryRow[]): { rowId: number; rowIndex: number; col: number; message: string } | null {
  for (let i = 0; i < rows.length; i++) {
    const r = rows[i]!;
    if (r.errors.length > 0) {
      const message = r.errors[0]!;
      return { rowId: r.id, rowIndex: i, col: errorCol(message), message };
    }
  }
  return null;
}
