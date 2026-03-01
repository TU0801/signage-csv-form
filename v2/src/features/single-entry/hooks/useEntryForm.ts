import { useForm, type Resolver } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { entrySchema, type EntrySchemaType } from '../schemas/entrySchema';
import { DEFAULT_DISPLAY_DURATION } from '@/lib/constants';
import type { EntryFormData } from '@/types/app';

const defaultValues: EntryFormData = {
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
  posterPosition: '4',
  frameNo: '1',
  showOnBoard: true,
};

export function useEntryForm() {
  const form = useForm<EntryFormData>({
    resolver: zodResolver(entrySchema) as Resolver<EntryFormData>,
    defaultValues,
    mode: 'onBlur',
  });

  const resetForm = () => {
    form.reset(defaultValues);
  };

  return {
    form,
    resetForm,
  } as const;
}

export type { EntrySchemaType };
