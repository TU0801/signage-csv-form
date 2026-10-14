import type { ReactNode } from 'react';

export interface FormFieldDef {
  name: string;
  label: string;
  type: 'text' | 'number' | 'select' | 'textarea' | 'checkbox' | 'custom';
  required?: boolean;
  options?: { value: string; label: string }[];
  placeholder?: string;
}

/**
 * マスターの読み書き。表名と列は lib/api 側の関数に書く（check:schema が静的に照合できるよう、
 * 表名を設定の文字列で渡して汎用の .from() に流さない）。読み取り専用の表は list だけを持つ。
 */
export interface MasterApi<T> {
  /** 並び順は関数側で決める（v1 の getMaster* と同じ order） */
  list: () => Promise<T[]>;
  add?: (data: Partial<T>) => Promise<unknown>;
  update?: (id: string, data: Partial<T>) => Promise<unknown>;
  remove?: (id: string) => Promise<void>;
}

export interface MasterConfig<T extends Record<string, unknown>> {
  api: MasterApi<T>;
  displayName: string;
  /** 検索の対象の列（複数なら空白でつないだ文字列を部分一致で探す） */
  searchFields: (keyof T & string)[];
  searchPlaceholder?: string;
  /** 削除の確認に出す名前の列 */
  labelField: keyof T & string;
  columns: { key: keyof T & string; label: string; width?: string }[];
  formFields: FormFieldDef[];
  defaultValues: Partial<T>;
  /** 一覧だけ出し、追加・編集・削除を出さない（正本が別システムにあり DB が直接の書き込みを拒否する表） */
  readOnly?: boolean;
  /** 一覧の上に出す案内（業務システムへのリンクなど） */
  note?: ReactNode;
  /** 保存（追加・更新）で送る列を組み立てる。省略時はフォームの値をそのまま渡す */
  toPayload?: (data: Partial<T>) => Partial<T>;
  /** 削除の前の確認。削除できない理由（文言）を返すと、確認を出さずにその文言をエラーで出す */
  beforeDelete?: (item: T) => Promise<string | null>;
}
