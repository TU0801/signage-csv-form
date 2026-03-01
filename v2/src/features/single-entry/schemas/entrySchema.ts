import { z } from 'zod';

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
  displayDuration: z.number().min(1, '表示時間は1秒以上にしてください').default(10),
  noticeText: z.string().default(''),
  remarks: z.string().default(''),
  posterType: z.enum(['template', 'custom']).default('template'),
  posterPosition: z.string().default('4'),
  frameNo: z.string().default('1'),
  showOnBoard: z.boolean().default(true),
  customPosterUrl: z.string().default(''),
});

export type EntrySchemaType = z.infer<typeof entrySchema>;
