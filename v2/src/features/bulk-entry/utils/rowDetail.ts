import type { BulkEntryRow } from '../types';

/** 貼紙表示位置。v1: js/bulk-modals.js createRowDetailModal の detailPosition */
export const POSITIONS = [
  { value: '1', label: '①上左' },
  { value: '2', label: '②上中' },
  { value: '3', label: '③上右' },
  { value: '4', label: '④中央' },
  { value: '0', label: '⓪全体' },
];

/** YYYY-MM-DD を M/D にする（表の中で短く見せる） */
function shortDate(d: string): string {
  const m = d.match(/^\d{4}-(\d{2})-(\d{2})$/);
  return m ? `${Number(m[1])}/${Number(m[2])}` : d;
}

/** 詳細設定（案内文・表示期間・表示時間・位置）のどれかを既定から変えたか */
export function hasRowDetail(row: BulkEntryRow, defaultDisplayTime: number): boolean {
  return !!(
    row.noticeText ||
    row.displayStartDate ||
    row.displayStartTime ||
    row.displayEndDate ||
    row.displayEndTime ||
    row.position !== 2 ||
    (row.displayTime && row.displayTime !== defaultDisplayTime)
  );
}

/**
 * 詳細設定の要約（詳細ボタンの title に出す）。申請で保存される値に合わせる:
 * 表示開始日が空なら申請日、表示終了日が空なら点検終了日（それも空なら未設定）。
 * 例: 「表示期間: 申請日〜10/25(点検終了日)・位置: ②上中・表示時間: 6秒」
 */
export function rowDetailSummary(row: BulkEntryRow): string {
  const start = row.displayStartDate ? shortDate(row.displayStartDate) : '申請日';
  const end = row.displayEndDate
    ? shortDate(row.displayEndDate)
    : row.endDate
      ? `${shortDate(row.endDate)}(点検終了日)`
      : '未設定';
  // 貼り付けの8列目が数字でないと NaN のまま保存される（v1 と同じ）ので、既定に見せず不正値と出す
  const position = Number.isNaN(row.position)
    ? '不正値'
    : (POSITIONS.find((p) => p.value === String(row.position))?.label ?? String(row.position));
  const parts = [`表示期間: ${start}〜${end}`, `位置: ${position}`, `表示時間: ${row.displayTime}秒`];
  if (row.noticeText) parts.push('案内文あり');
  return parts.join('・');
}
