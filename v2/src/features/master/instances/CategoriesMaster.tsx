import { fetchMasterCategories } from '@/lib/api/masterData';
import { addCategory, updateCategory, deleteCategory } from '@/lib/api/admin-masters';
import type { DbCategory } from '@/types/database';
import type { MasterConfig } from '../types/masterConfig';
import { MasterListPage } from '../components/MasterListPage';

type CategoryRecord = DbCategory & Record<string, unknown>;

/** 表示順序は数値にする（空欄・不正値は 0） */
// v1: js/admin-masters.js handleMasterFormSubmit（parseInt(categorySortOrder) || 0）
export function toCategoryInput(data: Partial<CategoryRecord>) {
  return {
    category_name: String(data.category_name ?? ''),
    sort_order: parseInt(String(data.sort_order ?? ''), 10) || 0,
  };
}

// v1: js/admin-masters.js renderCategories / openMasterModal('category') / deleteMasterCategoryAction（使用中の確認は無い）
const config: MasterConfig<CategoryRecord> = {
  api: {
    list: async () => (await fetchMasterCategories()) as CategoryRecord[],
    add: (data) => addCategory(toCategoryInput(data)),
    update: (id, data) => updateCategory(id, toCategoryInput(data)),
    remove: deleteCategory,
  },
  displayName: 'カテゴリ',
  searchFields: ['category_name'],
  searchPlaceholder: 'カテゴリ名で検索...',
  labelField: 'category_name',
  columns: [
    { key: 'category_name', label: 'カテゴリ名' },
    { key: 'sort_order', label: '表示順序', width: '100px' },
  ],
  formFields: [
    { name: 'category_name', label: 'カテゴリ名', type: 'text', required: true },
    { name: 'sort_order', label: '表示順序', type: 'number', placeholder: '0' },
  ],
  defaultValues: {
    category_name: '',
    sort_order: 0,
  } as Partial<CategoryRecord>,
};

export function CategoriesMaster() {
  return (
    <MasterListPage
      config={config}
      renderCell={(key, value) => (key === 'sort_order' ? String(value ?? 0) : undefined)}
    />
  );
}
