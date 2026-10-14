/** パスワードの最小文字数（Edge Function signage-admin-users の MIN_PASSWORD_LENGTH と同じ） */
export const MIN_PASSWORD_LENGTH = 6;

/** 権限の選択肢。v1 と同じ並び（ユーザー → 管理者）で、既定はユーザー（v1: admin.html #newUserRole） */
export const ROLE_OPTIONS = [
  { value: 'user', label: 'ユーザー' },
  { value: 'admin', label: '管理者' },
];
