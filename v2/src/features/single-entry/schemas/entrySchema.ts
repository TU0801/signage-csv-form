import { z } from 'zod';
import {
  DISPLAY_TIME_MAX,
  REMARKS_MAX_LINES,
  REMARKS_MAX_CHARS_PER_LINE,
  NOTICE_TEXT_MAX_CHARS,
} from '@/lib/constants';

export const entrySchema = z.object({
  propertyCode: z.string().min(1, '物件を選択してください'),
  terminalId: z.string().min(1, '端末IDを選択してください'),
  vendorName: z.string().min(1, '保守会社を選択してください'),
  emergencyContact: z.string().default(''),
  inspectionType: z.string().min(1, '点検種別を選択してください'),
  templateNo: z.string().default(''),
  startDate: z.string().min(1, '点検開始日を入力してください'),
  endDate: z.string().min(1, '点検終了日を入力してください'),
  displayStartDate: z.string().min(1, '表示開始日を入力してください'),
  displayStartTime: z.string().default(''),
  displayEndDate: z.string().min(1, '表示終了日を入力してください'),
  displayEndTime: z.string().default(''),
  displayDuration: z.number()
    .min(1, '表示時間は1秒以上にしてください')
    .max(DISPLAY_TIME_MAX, `表示時間は${DISPLAY_TIME_MAX}秒以下にしてください`)
    .default(6),
  noticeText: z.string()
    .max(NOTICE_TEXT_MAX_CHARS, `案内文は${NOTICE_TEXT_MAX_CHARS}文字以内にしてください`)
    .default(''),
  remarks: z.string().default(''),
  posterType: z.enum(['template', 'custom']).default('template'),
  posterPosition: z.string().default('2'),
  frameNo: z.string().default('2'),
  showOnBoard: z.boolean().default(true),
  customPosterUrl: z.string().default(''),
}).refine(
  (data) => {
    if (!data.startDate || !data.endDate) return true;
    return data.startDate <= data.endDate;
  },
  { message: '点検開始日は終了日以前にしてください', path: ['endDate'] },
).refine(
  (data) => {
    if (!data.displayStartDate || !data.displayEndDate) return true;
    return data.displayStartDate <= data.displayEndDate;
  },
  { message: '表示開始日は表示終了日以前にしてください', path: ['displayEndDate'] },
).refine(
  (data) => {
    if (!data.remarks) return true;
    const lines = data.remarks.split('\n');
    return lines.length <= REMARKS_MAX_LINES;
  },
  { message: `備考は${REMARKS_MAX_LINES}行以内にしてください`, path: ['remarks'] },
).refine(
  (data) => {
    if (!data.remarks) return true;
    const lines = data.remarks.split('\n');
    return lines.every((line) => line.length <= REMARKS_MAX_CHARS_PER_LINE);
  },
  { message: `備考は1行${REMARKS_MAX_CHARS_PER_LINE}文字以内にしてください`, path: ['remarks'] },
).refine(
  (data) => {
    if (data.posterType !== 'custom') return true;
    return !!data.customPosterUrl;
  },
  { message: 'カスタム画像を選択してください', path: ['customPosterUrl'] },
);

export type EntrySchemaType = z.infer<typeof entrySchema>;
