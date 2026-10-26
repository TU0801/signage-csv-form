import { describe, expect, it } from 'vitest';
import { REMARKS_PLACEHOLDER, remarksNotice } from '../remarks';

describe('掲示備考の目安（修正依頼1026 I8）', () => {
  it('目安の中なら注意なし、行数・1行の文字数を超えたら注意を返す', () => {
    expect(remarksNotice('', 25, 5)).toBeNull();
    expect(remarksNotice('12345\n12345', 5, 2)).toBeNull();
    expect(remarksNotice('a\nb\nc', 5, 2)).toBe('目安を超えています: 3行（目安 2行以内）。掲示で切れることがあります');
    expect(remarksNotice('123456', 5, 2)).toBe('目安を超えています: 1行最長 6文字（目安 5文字）。掲示で切れることがあります');
  });

  it('入力例は旧システムの2行（例と文字数の目安）', () => {
    expect(REMARKS_PLACEHOLDER.split('\n')).toEqual([
      '例) 001号機:9時30分～11時00分',
      '1行につき30文字程度、5行以内で入力してください',
    ]);
  });
});
