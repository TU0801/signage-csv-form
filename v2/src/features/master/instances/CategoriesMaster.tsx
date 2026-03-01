import { TABLES } from '@/lib/supabase';
import type { DbCategory } from '@/types/database';
import type { MasterConfig } from '../types/masterConfig';
import { MasterListPage } from '../components/MasterListPage';

type CategoryRecord = DbCategory & Record<string, unknown>;

const config: MasterConfig<CategoryRecord> = {
  tableName: TABLES.categories,
  displayName: 'カテゴリ',
  searchField: 'category_name',
  uniqueField: 'category_name',
  defaultSort: 'sort_order',
  columns: [
    { key: 'category_name', label: 'カテゴリ名' },
    { key: 'sort_order', label: '表示順', width: '100px' },
  ],
  formFields: [
    { name: 'category_name', label: 'カテゴリ名', type: 'text', required: true },
    { name: 'sort_order', label: '表示順', type: 'number', placeholder: '0' },
  ],
  defaultValues: {
    category_name: '',
    sort_order: 0,
  } as Partial<CategoryRecord>,
};

export function CategoriesMaster() {
  return <MasterListPage config={config} />;
}
