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
  /** 一覧だけ出し、追加・編集・削除を出さない（正本が別システムにあり DB が直接の書き込みを拒否する表） */
  readOnly?: boolean;
  /** readOnly のとき一覧の上に出す案内 */
  readOnlyNote?: string;
  /** 保存（追加・更新）で送る列を組み立てる。省略時はフォームの値をそのまま送る */
  toPayload?: (data: Partial<T>) => Partial<T>;
}
