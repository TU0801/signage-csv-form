import { describe, expect, it } from 'vitest';
import { validateSettings, type SettingValues } from '../settingFields';

const ok: SettingValues = {
  display_time_max: '30',
  display_time_default: '6',
  remarks_chars_per_line: '25',
  remarks_max_lines: '5',
  notice_text_max_chars: '200',
};

describe('validateSettings', () => {
  it('空・整数でない値・範囲外と、表示時間の既定値が上限を超えるものをエラーにする', () => {
    expect(validateSettings(ok)).toEqual({});
    expect(
      validateSettings({ ...ok, remarks_max_lines: '', notice_text_max_chars: '12.5', remarks_chars_per_line: '9' }),
    ).toEqual({
      remarks_max_lines: '整数で入力してください',
      notice_text_max_chars: '整数で入力してください',
      remarks_chars_per_line: '10〜50 の範囲で入力してください',
    });
    expect(validateSettings({ ...ok, display_time_max: '10', display_time_default: '12' })).toEqual({
      display_time_default: '表示時間の上限以下にしてください',
    });
  });
});
