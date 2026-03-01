import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { TextArea } from '@/components/ui/TextArea';
import type { MasterConfig, FormFieldDef } from '../types/masterConfig';

interface MasterFormModalProps<T extends Record<string, unknown>> {
  open: boolean;
  onClose: () => void;
  onSubmit: (data: Partial<T>) => Promise<void>;
  config: MasterConfig<T>;
  editItem: T | null;
  renderCustomField?: (field: FormFieldDef, form: ReturnType<typeof useForm>) => React.ReactNode;
}

export function MasterFormModal<T extends Record<string, unknown>>({
  open,
  onClose,
  onSubmit,
  config,
  editItem,
  renderCustomField,
}: MasterFormModalProps<T>) {
  const form = useForm({
    defaultValues: (editItem ?? config.defaultValues) as Record<string, unknown>,
  });

  const {
    register,
    handleSubmit,
    reset,
    formState: { isSubmitting },
  } = form;

  useEffect(() => {
    if (open) {
      reset((editItem ?? config.defaultValues) as Record<string, unknown>);
    }
  }, [open, editItem, config.defaultValues, reset]);

  const onFormSubmit = handleSubmit(async (data) => {
    await onSubmit(data as Partial<T>);
    onClose();
  });

  const title = editItem ? `${config.displayName}を編集` : `${config.displayName}を追加`;

  return (
    <Modal open={open} onClose={onClose} title={title} className="max-w-md">
      <form onSubmit={onFormSubmit} className="space-y-4">
        {config.formFields.map((field) => {
          if (field.type === 'custom' && renderCustomField) {
            return (
              <div key={field.name}>{renderCustomField(field, form)}</div>
            );
          }
          return (
            <div key={field.name}>
              {renderFieldByType(field, register)}
            </div>
          );
        })}

        <div className="flex justify-end gap-3 pt-4">
          <Button variant="secondary" type="button" onClick={onClose}>
            キャンセル
          </Button>
          <Button type="submit" disabled={isSubmitting}>
            {isSubmitting ? '保存中...' : '保存'}
          </Button>
        </div>
      </form>
    </Modal>
  );
}

function renderFieldByType(
  field: FormFieldDef,
  register: ReturnType<typeof useForm>['register'],
): React.ReactNode {
  switch (field.type) {
    case 'text':
      return (
        <Input
          label={field.label}
          placeholder={field.placeholder}
          required={field.required}
          {...register(field.name, { required: field.required })}
        />
      );
    case 'number':
      return (
        <Input
          label={field.label}
          type="number"
          placeholder={field.placeholder}
          required={field.required}
          {...register(field.name, { required: field.required, valueAsNumber: true })}
        />
      );
    case 'select':
      return (
        <Select
          label={field.label}
          options={field.options ?? []}
          placeholder={field.placeholder ?? '選択してください'}
          required={field.required}
          {...register(field.name, { required: field.required })}
        />
      );
    case 'textarea':
      return (
        <TextArea
          label={field.label}
          placeholder={field.placeholder}
          required={field.required}
          rows={3}
          {...register(field.name, { required: field.required })}
        />
      );
    case 'checkbox':
      return (
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            className="rounded border-gray-300"
            {...register(field.name)}
          />
          <span className="text-gray-700">{field.label}</span>
        </label>
      );
    default:
      return null;
  }
}
