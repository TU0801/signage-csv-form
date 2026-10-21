/*
 * 報告書アップロードの入力チェック。バケット（inspection-reports）は PDF・50MB に制限してあるが、
 * 送ってから英語のエラーで落ちるより先に日本語で止める
 */

export const MAX_REPORT_BYTES = 50 * 1024 * 1024;

const PDF_MIMES = new Set(['application/pdf', 'application/x-pdf']);

/** PDF か（拡張子と MIME の両方）と大きさ。問題なければ null */
export function validateReportFile(file: Pick<File, 'name' | 'type' | 'size'>): string | null {
  if (!/\.pdf$/i.test(file.name) || !PDF_MIMES.has(file.type)) {
    return 'PDF ファイルを選んでください';
  }
  if (file.size === 0) return 'ファイルが空です';
  if (file.size > MAX_REPORT_BYTES) return 'ファイルが大きすぎます（50MB まで）';
  return null;
}

export interface UploadCheck {
  /** 送信できない理由（項目ごと） */
  errors: { file?: string; performedOn?: string };
  /** 送信はできるが確かめてほしいこと */
  warnings: string[];
}

export function checkUpload(
  input: { file: Pick<File, 'name' | 'type' | 'size'> | null; performedOn: string },
  today: string,
): UploadCheck {
  const errors: UploadCheck['errors'] = {};
  const warnings: string[] = [];
  if (!input.file) errors.file = 'ファイルを選んでください';
  else {
    const fileError = validateReportFile(input.file);
    if (fileError) errors.file = fileError;
  }
  if (!input.performedOn) errors.performedOn = '実施日を入力してください';
  else if (input.performedOn > today) warnings.push('実施日が未来の日付です。誤りがないか確かめてください');
  return { errors, warnings };
}
