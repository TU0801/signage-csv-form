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

/** 詳細設定（案内文・連絡先・貼紙・表示期間・表示時間・位置）のどれかを既定から変えたか */
export function hasRowDetail(row: BulkEntryRow, defaultDisplayTime: number): boolean {
  return !!(
    row.noticeText ||
    row.emergencyContact ||
    row.posterType === 'custom' ||
    (row.extraPosters?.length ?? 0) > 0 ||
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
 * 表示開始日が空なら申請日、表示終了日が空なら点検終了日（それも空なら点検開始日、どちらも空なら未設定）。
 * 例: 「表示期間: 申請日〜10/25(点検終了日)・位置: ②上中・表示時間: 6秒」
 */
export function rowDetailSummary(row: BulkEntryRow): string {
  const start = row.displayStartDate ? shortDate(row.displayStartDate) : '申請日';
  const end = row.displayEndDate
    ? shortDate(row.displayEndDate)
    : row.endDate
      ? `${shortDate(row.endDate)}(点検終了日)`
      : row.startDate
        ? `${shortDate(row.startDate)}(点検開始日)`
        : '未設定';
  // 貼り付けの8列目が数字でないと NaN のまま保存される（v1 と同じ）ので、既定に見せず不正値と出す
  const position = Number.isNaN(row.position)
    ? '不正値'
    : (POSITIONS.find((p) => p.value === String(row.position))?.label ?? String(row.position));
  const parts = [`表示期間: ${start}〜${end}`, `位置: ${position}`, `表示時間: ${row.displayTime}秒`];
  if (row.posterType === 'custom') parts.push(row.posterImage ? '貼紙: 追加' : '貼紙: 追加（画像未選択）');
  if (row.extraPosters?.length) parts.push(`追加の貼紙: ${row.extraPosters.length}枚`);
  if (row.noticeText) parts.push('案内文あり');
  if (row.emergencyContact) parts.push(`連絡先: ${row.emergencyContact}`);
  return parts.join('・');
}

/**
 * 表示期間が既定と違うか（詳細設定で表示期間を最初から開いておくかの判定）。
 * 既定は「空」か「点検期間と同じ日付・時刻なし」（旧モーダルが開くたびに点検期間を入れていたため、その値も既定とみなす）
 */
export function hasCustomDisplayPeriod(
  row: Pick<BulkEntryRow, 'displayStartDate' | 'displayStartTime' | 'displayEndDate' | 'displayEndTime' | 'startDate' | 'endDate'>,
): boolean {
  if (row.displayStartTime || row.displayEndTime) return true;
  if (row.displayStartDate && row.displayStartDate !== row.startDate) return true;
  if (row.displayEndDate && row.displayEndDate !== row.endDate) return true;
  return false;
}

/**
 * テンプレート名（template_images.display_name。image_key は大小文字を無視して突き合わせる＝実 DB で 10 件が大小文字違い）。
 * 見つからなければ点検種別名
 */
export function templateDisplayName(
  templateNo: string,
  inspectionType: string,
  images: { image_key: string; display_name: string }[],
): string {
  const key = templateNo.toLowerCase();
  const hit = key ? images.find((i) => i.image_key.toLowerCase() === key) : undefined;
  return hit?.display_name || inspectionType;
}

/**
 * 申請で保存される表示期間（buildBulkEntries と詳細設定の畳んだ要約の両方がこれを使う）。
 * startDate が null なら申請日（申請した日の日付）、endDate は表示終了日 → 点検終了日 → 点検開始日（終了日が空の1日の点検）→ null。
 * today を渡すと、表示開始日が空で表示終了日が today より前（点検月を過ぎた予定を後から申請した）のとき、
 * 申請日を開始日にすると期間が逆になるので、点検開始日（表示終了日より後なら表示終了日）を開始日にする
 */
export function submittedDisplayPeriod(
  row: Pick<BulkEntryRow, 'displayStartDate' | 'displayStartTime' | 'displayEndDate' | 'displayEndTime' | 'endDate'> &
    Partial<Pick<BulkEntryRow, 'startDate'>>,
  today?: string,
): { startDate: string | null; startTime: string | null; endDate: string | null; endTime: string | null } {
  // 終了日を空のまま申請すると表示終了日が null（終わりの無い掲示）になるので、1日の点検として点検開始日で終える（修正依頼1026 再検証）
  const endDate = row.displayEndDate || row.endDate || row.startDate || null;
  let startDate = row.displayStartDate || null;
  if (!startDate && today && endDate && endDate < today) {
    startDate = row.startDate && row.startDate <= endDate ? row.startDate : endDate;
  }
  return {
    startDate,
    startTime: row.displayStartTime || null,
    endDate,
    endTime: row.displayEndTime || null,
  };
}
