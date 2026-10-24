/**
 * 点検開始日を変えたときの点検終了日（一括入力・1件入力で共通。修正依頼1024 B10）。
 * 終了日が空・旧開始日と同じ（追従していた）・新開始日より前、のどれかなら新開始日にする。
 * それ以外（手で別の日を入れた終了日）は残す。終了日はこのあと手で直せる。開始日を消したときは終了日を変えない
 */
export function followEndDate(prevStart: string, prevEnd: string, nextStart: string): string {
  if (!nextStart) return prevEnd;
  if (!prevEnd || prevEnd === prevStart || prevEnd < nextStart) return nextStart;
  return prevEnd;
}
