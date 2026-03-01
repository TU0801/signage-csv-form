import { useState, useEffect, useCallback, useMemo } from 'react';
import { supabase, TABLES } from '@/lib/supabase';
import type { DbInspectionType, DbCategory } from '@/types/database';
import type { MasterConfig } from '../types/masterConfig';
import { MasterListPage } from '../components/MasterListPage';

type InspectionTypeRecord = DbInspectionType & Record<string, unknown>;

function useCategories() {
  const [categories, setCategories] = useState<DbCategory[]>([]);

  useEffect(() => {
    void (async () => {
      const { data } = await supabase
        .from(TABLES.categories)
        .select('*')
        .order('sort_order', { ascending: true });
      setCategories(data ?? []);
    })();
  }, []);

  return categories;
}

export function InspectionTypesMaster() {
  const categories = useCategories();

  const config: MasterConfig<InspectionTypeRecord> = useMemo(
    () => ({
      tableName: TABLES.inspectionTypes,
      displayName: '点検種別',
      searchField: 'inspection_name',
      uniqueField: 'inspection_name',
      defaultSort: 'sort_order',
      columns: [
        { key: 'inspection_name', label: '点検種別名' },
        { key: 'template_no', label: 'テンプレNo', width: '120px' },
        { key: 'category_id', label: 'カテゴリ', width: '150px' },
        { key: 'show_on_board', label: '掲示板表示', width: '100px' },
      ],
      formFields: [
        { name: 'inspection_name', label: '点検種別名', type: 'text' as const, required: true },
        { name: 'template_no', label: 'テンプレNo', type: 'text' as const, required: true },
        {
          name: 'category_id',
          label: 'カテゴリ',
          type: 'select' as const,
          placeholder: 'カテゴリを選択',
          options: categories.map((c) => ({ value: c.id, label: c.category_name })),
        },
        { name: 'default_text', label: 'デフォルトテキスト', type: 'textarea' as const },
        { name: 'show_on_board', label: '掲示板に表示', type: 'checkbox' as const },
      ],
      defaultValues: {
        inspection_name: '',
        template_no: '',
        category_id: '',
        default_text: '',
        show_on_board: false,
      } as Partial<InspectionTypeRecord>,
    }),
    [categories],
  );

  const renderCell = useCallback(
    (key: string, value: unknown) => {
      if (key === 'category_id' && typeof value === 'string') {
        const categoryMap = new Map(categories.map((c) => [c.id, c.category_name]));
        return categoryMap.get(value) ?? '-';
      }
      if (key === 'show_on_board') {
        return value ? 'はい' : 'いいえ';
      }
      return undefined;
    },
    [categories],
  );

  return (
    <MasterListPage
      config={config}
      renderCell={renderCell}
    />
  );
}
