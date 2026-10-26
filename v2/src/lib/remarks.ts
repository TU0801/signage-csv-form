/*
 * 掲示備考（点検時間の詳細など）の入力の目安（修正依頼1026 I8）。
 * 1行の文字数・行数は目安で、超えたら入力欄の下に注意を出すだけで申請は止めない。
 * 目安の数は設定（remarks_chars_per_line・remarks_max_lines）。入力例は旧システムの文言。
 */

/** 入力例（一括入力・1件入力の備考の placeholder。旧システムの例） */
export const REMARKS_PLACEHOLDER = '例) 001号機:9時30分～11時00分\n1行につき30文字程度、5行以内で入力してください';

/** 目安を超えているときの注意（超えていなければ null） */
export function remarksNotice(text: string, perLine: number, maxLines: number): string | null {
  if (!text) return null;
  const lines = text.split('\n');
  const longest = lines.reduce((m, l) => Math.max(m, l.length), 0);
  const parts: string[] = [];
  if (lines.length > maxLines) parts.push(`${lines.length}行（目安 ${maxLines}行以内）`);
  if (longest > perLine) parts.push(`1行最長 ${longest}文字（目安 ${perLine}文字）`);
  return parts.length > 0 ? `目安を超えています: ${parts.join('・')}。掲示で切れることがあります` : null;
}
