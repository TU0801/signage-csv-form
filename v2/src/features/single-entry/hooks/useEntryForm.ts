import { useForm, type Resolver } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { entrySchema, type EntrySchemaType } from '../schemas/entrySchema';
import { DEFAULT_DISPLAY_DURATION } from '@/lib/constants';
import type { EntryFormData } from '@/types/app';

export const DEFAULT_ENTRY_FORM_DATA: EntryFormData = {
  propertyCode: '',
  terminalId: '',
  vendorName: '',
  emergencyContact: '',
  inspectionType: '',
  templateNo: '',
  startDate: '',
  endDate: '',
  displayStartDate: '',
  displayStartTime: '',
  displayEndDate: '',
  displayEndTime: '',
  displayDuration: DEFAULT_DISPLAY_DURATION,
  noticeText: '',
  remarks: '',
  posterType: 'template',
  posterPosition: '2',
  frameNo: '2',
  showOnBoard: true,
  customPosterUrl: '',
};

export function useEntryForm() {
  const form = useForm<EntryFormData>({
    resolver: zodResolver(entrySchema) as Resolver<EntryFormData>,
    defaultValues: DEFAULT_ENTRY_FORM_DATA,
    mode: 'onBlur',
  });

  const resetForm = () => {
    form.reset(DEFAULT_ENTRY_FORM_DATA);
  };

  return {
    form,
    resetForm,
  } as const;
}

export type { EntrySchemaType };
