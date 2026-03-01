export interface FormFieldDef {
  name: string;
  label: string;
  type: 'text' | 'number' | 'select' | 'textarea' | 'checkbox' | 'custom';
  required?: boolean;
  options?: { value: string; label: string }[];
  placeholder?: string;
}

export interface MasterConfig<T extends Record<string, unknown>> {
  tableName: string;
  displayName: string;
  searchField: keyof T & string;
  uniqueField: keyof T & string;
  defaultSort: keyof T & string;
  columns: { key: keyof T & string; label: string; width?: string }[];
  formFields: FormFieldDef[];
  defaultValues: Partial<T>;
}
