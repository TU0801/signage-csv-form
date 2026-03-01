import type { EntryFormData } from '@/types/app';

export interface ValidationErrors {
  [field: string]: string;
}

const REQUIRED_FIELDS: { key: keyof EntryFormData; label: string }[] = [
  { key: 'propertyCode', label: '物件コード' },
  { key: 'terminalId', label: '端末ID' },
  { key: 'vendorName', label: '保守会社名' },
  { key: 'inspectionType', label: '点検種別' },
  { key: 'startDate', label: '開始日' },
  { key: 'endDate', label: '終了日' },
  { key: 'displayStartDate', label: '表示開始日' },
  { key: 'displayEndDate', label: '表示終了日' },
];

const DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;

function isValidDate(value: string): boolean {
  if (!DATE_REGEX.test(value)) return false;
  const d = new Date(value);
  return !isNaN(d.getTime());
}

export function validateBulkRow(row: EntryFormData): ValidationErrors {
  const errors: ValidationErrors = {};

  for (const { key, label } of REQUIRED_FIELDS) {
    const value = row[key];
    if (value === undefined || value === null || String(value).trim() === '') {
      errors[key] = `${label}は必須です`;
    }
  }

  // Date format validation
  const dateFields: { key: keyof EntryFormData; label: string }[] = [
    { key: 'startDate', label: '開始日' },
    { key: 'endDate', label: '終了日' },
    { key: 'displayStartDate', label: '表示開始日' },
    { key: 'displayEndDate', label: '表示終了日' },
  ];

  for (const { key, label } of dateFields) {
    const value = String(row[key] ?? '').trim();
    if (value && !isValidDate(value)) {
      errors[key] = `${label}はYYYY-MM-DD形式で入力してください`;
    }
  }

  // Date range validation
  if (row.startDate && row.endDate && !errors['startDate'] && !errors['endDate']) {
    if (row.startDate > row.endDate) {
      errors['endDate'] = '終了日は開始日以降にしてください';
    }
  }

  if (
    row.displayStartDate &&
    row.displayEndDate &&
    !errors['displayStartDate'] &&
    !errors['displayEndDate']
  ) {
    if (row.displayStartDate > row.displayEndDate) {
      errors['displayEndDate'] = '表示終了日は表示開始日以降にしてください';
    }
  }

  // displayDuration validation
  if (row.displayDuration !== undefined && row.displayDuration !== null) {
    if (typeof row.displayDuration === 'number' && row.displayDuration < 0) {
      errors['displayDuration'] = '表示時間は0以上にしてください';
    }
  }

  return errors;
}
