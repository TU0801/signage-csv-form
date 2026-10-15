/**
 * 承認待ち・承認済みの表で、名前の列（物件名・点検種別・備考・保守会社・登録者）の幅を決めるクラス。
 *
 * 表は auto レイアウトなので、セルの中身が `max-w-* truncate` だけだと、列は文字の長さまで広がって縮まない
 * （本番の長い名前だと FHD でも表が横にはみ出す）。そこで
 * - 見出し（th）に表の幅に対する割合と最小幅を付けて、列の幅を表の幅に合わせて伸び縮みさせる
 * - セルの中身は `w-0 min-w-full truncate` にして、文字の長さが列の幅に影響しないようにし、はみ出た分は … で省略する
 *   （全文は title で見せる）
 * 最小幅より狭くなるとき（1366 幅でサイドバーを開いたときなど）は表が横にスクロールし、操作の列は右端に固定される。
 */
export const NAME_COL = {
  property: 'w-[13%] min-w-[8rem]',
  inspectionType: 'w-[11%] min-w-[6rem]',
  remarks: 'w-[13%] min-w-[6rem]',
  vendor: 'w-[14%] min-w-[6rem]',
  registrant: 'w-[10%] min-w-[6rem]',
} as const;

/** 名前の列のセルの中身。列の幅いっぱいに置き、はみ出た分は省略する */
export const NAME_CELL = 'w-0 min-w-full truncate';
