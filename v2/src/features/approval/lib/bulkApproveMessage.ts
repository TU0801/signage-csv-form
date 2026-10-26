/**
 * 一括承認の結果の知らせ（修正依頼1026 後続）。承認は版を比べて1件ずつなので一部だけ通ることがある。
 * 通った件数を先に、断られた件数（修正されていた・ほかの理由）と建物未承認で外した件数を括弧で添える。
 * 全部通ったときだけ success、1件でも承認していなければ error（一括却下と同じ）
 */
export function bulkApproveMessage(o: {
  /** 承認できた件数 */
  succeeded: number;
  /** 画面で読んだ後に修正されていて断られた件数 */
  stale: number;
  /** それ以外の理由で断られた件数 */
  otherFailed: number;
  /** otherFailed の最初の理由 */
  otherReason: string;
  /** 建物未承認のため承認に出さなかった件数 */
  blocked: number;
}): { message: string; tone: 'success' | 'error' } {
  const notes: string[] = [];
  if (o.stale > 0) notes.push(`${o.stale}件は修正されていたため承認していません`);
  if (o.otherFailed > 0) notes.push(`${o.otherFailed}件は承認できませんでした: ${o.otherReason}`);
  if (o.blocked > 0) notes.push(`建物未承認の${o.blocked}件は承認していません`);
  const suffix = notes.length > 0 ? `（${notes.join('。')}）` : '';
  const tone = o.stale + o.otherFailed > 0 ? 'error' : 'success';
  return {
    message: o.succeeded > 0 ? `${o.succeeded}件を承認しました${suffix}` : `承認できませんでした${suffix}`,
    tone,
  };
}
