import { useState } from 'react';
import { TABLES } from '@/lib/supabase';
import { uploadTemplateImage } from '@/lib/storage';
import { useToast } from '@/components/ui/Toast';
import type { DbTemplateImage } from '@/types/database';
import type { MasterConfig, FormFieldDef } from '../types/masterConfig';
import { MasterListPage } from '../components/MasterListPage';
import type { useForm } from 'react-hook-form';

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
    { name: 'image_upload', label: '画像ファイル', type: 'custom' },
    { name: 'category', label: 'カテゴリ', type: 'text' },
  ],
  defaultValues: {
    image_key: '',
    display_name: '',
    image_url: '',
    category: '',
  } as Partial<TemplateImageRecord>,
};

function ImageUploadField({ form }: { form: ReturnType<typeof useForm> }) {
  const { addToast } = useToast();
  const [uploading, setUploading] = useState(false);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const imageKey = form.getValues('image_key') as string;
    if (!imageKey) {
      addToast('先に画像キーを入力してください', 'warning');
      e.target.value = '';
      return;
    }

    setUploading(true);
    try {
      const url = await uploadTemplateImage(file, imageKey);
      form.setValue('image_url', url);
      addToast('画像をアップロードしました', 'success');
    } catch (err) {
      addToast(err instanceof Error ? err.message : 'アップロードに失敗しました', 'error');
    } finally {
      setUploading(false);
      e.target.value = '';
    }
  };

  return (
    <div className="space-y-1">
      <label className="block text-sm font-medium text-gray-700">
        画像ファイルアップロード
      </label>
      <input
        type="file"
        accept="image/png,image/jpeg"
        onChange={handleFileChange}
        disabled={uploading}
        className="block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-md file:border-0 file:text-sm file:font-medium file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100 disabled:opacity-50"
      />
      {uploading && (
        <p className="text-xs text-blue-600">アップロード中...</p>
      )}
    </div>
  );
}

export function TemplateImagesMaster() {
  const renderCustomField = (field: FormFieldDef, form: ReturnType<typeof useForm>) => {
    if (field.name === 'image_upload') {
      return <ImageUploadField form={form} />;
    }
    return null;
  };

  return <MasterListPage config={config} renderCustomField={renderCustomField} />;
}
