/**
 * 設定画面の項目。v1 のフォームと同じ5項目・既定値・入力範囲（v1 は入力欄の min/max だけ。v2 は保存時にも validateSettings で確かめる）。
 * v1: admin.html #master-settings / js/admin-settings.js loadAppSettings
 */
export const SETTING_FIELDS = [
  {
    key: 'display_time_max',
    label: '表示時間の上限（秒）',
    defaultValue: 30,
    min: 1,
    max: 60,
    hint: '掲示板の表示秒数の最大値',
  },
  {
    key: 'display_time_default',
    label: '表示時間のデフォルト値（秒）',
    defaultValue: 6,
    min: 1,
    max: 30,
    hint: '新規登録時の表示秒数の初期値',
  },
  {
    key: 'remarks_chars_per_line',
    label: '掲示備考の1行あたり文字数',
    defaultValue: 25,
    min: 10,
    max: 50,
  },
  {
    key: 'remarks_max_lines',
    label: '掲示備考の最大行数',
    defaultValue: 5,
    min: 1,
    max: 10,
  },
  {
    key: 'notice_text_max_chars',
    label: '案内文の最大文字数',
    defaultValue: 200,
    min: 50,
    max: 500,
  },
] as const satisfies readonly {
  key: string;
  label: string;
  defaultValue: number;
  min: number;
  max: number;
  hint?: string;
}[];

export type SettingKey = (typeof SETTING_FIELDS)[number]['key'];
/** signage_master_settings.setting_value は text なので画面でも文字列で持つ */
export type SettingValues = Record<SettingKey, string>;

/**
 * 保存前の検査。入力欄の min/max はスピンボタンでしか効かず、手で打てば範囲外も空も保存できてしまうため、
 * 同じ範囲を保存時にも確かめる。既定値が上限を超えると1件入力の初期値が上限エラーになるので、表示時間の既定値 ≤ 上限も見る。
 * 戻り値は項目ごとのエラー文（問題が無ければ空のオブジェクト）。
 */
export function validateSettings(values: SettingValues): Partial<Record<SettingKey, string>> {
  const errors: Partial<Record<SettingKey, string>> = {};
  for (const f of SETTING_FIELDS) {
    const raw = values[f.key]?.trim() ?? '';
    const n = Number(raw);
    if (raw === '' || !Number.isInteger(n)) errors[f.key] = '整数で入力してください';
    else if (n < f.min || n > f.max) errors[f.key] = `${f.min}〜${f.max} の範囲で入力してください`;
  }
  if (!errors.display_time_default && !errors.display_time_max) {
    if (Number(values.display_time_default) > Number(values.display_time_max)) {
      errors.display_time_default = '表示時間の上限以下にしてください';
    }
  }
  return errors;
}
