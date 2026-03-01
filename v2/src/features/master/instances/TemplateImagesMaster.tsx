import { TABLES } from '@/lib/supabase';
import type { DbTemplateImage } from '@/types/database';
import type { MasterConfig } from '../types/masterConfig';
import { MasterListPage } from '../components/MasterListPage';

type TemplateImageRecord = DbTemplateImage & Record<string, unknown>;

const config: MasterConfig<TemplateImageRecord> = {
  tableName: TABLES.templateImages,
  displayName: 'テンプレート画像',
  searchField: 'display_name',
  uniqueField: 'image_key',
  defaultSort: 'sort_order',
  columns: [
    { key: 'image_key', label: '画像キー', width: '150px' },
    { key: 'display_name', label: '表示名' },
    { key: 'image_url', label: '画像URL' },
    { key: 'category', label: 'カテゴリ', width: '120px' },
  ],
  formFields: [
    { name: 'image_key', label: '画像キー', type: 'text', required: true },
    { name: 'display_name', label: '表示名', type: 'text', required: true },
    { name: 'image_url', label: '画像URL', type: 'text', required: true },
    { name: 'category', label: 'カテゴリ', type: 'text' },
  ],
  defaultValues: {
    image_key: '',
    display_name: '',
    image_url: '',
    category: '',
  } as Partial<TemplateImageRecord>,
};

export function TemplateImagesMaster() {
  return <MasterListPage config={config} />;
}
