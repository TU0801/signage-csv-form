import { useState, useCallback } from 'react';
import { Card, CardHeader, CardContent } from '@/components/ui/Card';
import { Spinner } from '@/components/ui/Spinner';
import { useToast } from '@/components/ui/Toast';
import { useMasterData } from '@/hooks/useMasterData';
import { useEntryForm } from '@/features/single-entry/hooks/useEntryForm';
import { useCascadingSelects } from '@/features/single-entry/hooks/useCascadingSelects';
import { usePreview } from '@/features/single-entry/hooks/usePreview';
import { EntryForm } from '@/features/single-entry/components/EntryForm';
import { EntryDataList } from '@/features/single-entry/components/EntryDataList';
import { CsvActions } from '@/features/single-entry/components/CsvActions';
import { PosterPreview } from '@/features/single-entry/components/PosterPreview';
import type { EntryFormData } from '@/types/app';

interface LocalEntry extends EntryFormData {
  _id: string;
}

export function SingleEntryPage() {
  const { addToast } = useToast();
  const { properties, vendors, inspectionTypes, categories, loading, error } = useMasterData();

  const { form, resetForm } = useEntryForm();
  const { setValue, reset } = form;

  const cascading = useCascadingSelects({
    setValue,
    properties,
    vendors,
    inspectionTypes,
    categories,
  });

  const preview = usePreview({ inspectionTypes });

  // ローカルエントリー一覧
  const [localEntries, setLocalEntries] = useState<LocalEntry[]>([]);
  const [editingId, setEditingId] = useState<string | null>(null);

  /** フォーム送信 → ローカル追加/更新 */
  const handleFormSubmit = useCallback(
    (data: EntryFormData) => {
      if (editingId) {
        setLocalEntries((prev) =>
          prev.map((e) => (e._id === editingId ? { ...data, _id: editingId } : e)),
        );
        setEditingId(null);
        addToast('エントリーを更新しました', 'success');
      } else {
        const newEntry: LocalEntry = {
          ...data,
          _id: crypto.randomUUID(),
        };
        setLocalEntries((prev) => [...prev, newEntry]);
        addToast('エントリーを追加しました', 'success');
      }
      resetForm();
    },
    [editingId, resetForm, addToast],
  );

  /** エントリー削除 */
  const handleRemove = useCallback(
    (id: string) => {
      setLocalEntries((prev) => prev.filter((e) => e._id !== id));
      if (editingId === id) {
        setEditingId(null);
        resetForm();
      }
      addToast('エントリーを削除しました', 'info');
    },
    [editingId, resetForm, addToast],
  );

  /** エントリー編集 */
  const handleEdit = useCallback(
    (id: string) => {
      const entry = localEntries.find((e) => e._id === id);
      if (!entry) return;
      const { _id, ...formData } = entry;
      reset(formData);
      setEditingId(_id);
    },
    [localEntries, reset],
  );

  /** リセットボタン */
  const handleReset = useCallback(() => {
    resetForm();
    setEditingId(null);
  }, [resetForm]);

  /** ポスター位置変更（プレビュー内） */
  const handlePositionChange = useCallback(
    (position: string) => {
      setValue('posterPosition', position);
    },
    [setValue],
  );

  const terminals = cascading.getTerminals(form.watch('propertyCode'));

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Spinner size="lg" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="text-center py-12 text-red-600">
        <p>マスターデータの読み込みに失敗しました</p>
        <p className="text-sm mt-1">{error}</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-bold text-gray-900">1件入力</h1>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* 左: フォーム */}
        <Card>
          <CardHeader>
            <h2 className="text-base font-semibold text-gray-900">
              {editingId ? 'エントリー編集' : 'エントリー入力'}
            </h2>
          </CardHeader>
          <CardContent>
            <EntryForm
              form={form}
              properties={properties}
              vendors={vendors}
              filteredInspectionTypes={cascading.filteredInspectionTypes}
              categoryOptions={cascading.categoryOptions}
              selectedCategoryId={cascading.selectedCategoryId}
              terminals={terminals}
              onPropertyChange={cascading.handlePropertyChange}
              onVendorChange={cascading.handleVendorChange}
              onCategoryChange={cascading.handleCategoryChange}
              onInspectionTypeChange={cascading.handleInspectionTypeChange}
              onPreview={preview.openPreview}
              onSubmit={handleFormSubmit}
              onReset={handleReset}
              isEditing={!!editingId}
            />
          </CardContent>
        </Card>

        {/* 右: 一覧 + CSV */}
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <h2 className="text-base font-semibold text-gray-900">
                  追加済みエントリー ({localEntries.length}件)
                </h2>
              </div>
            </CardHeader>
            <CardContent>
              <EntryDataList
                entries={localEntries}
                onRemove={handleRemove}
                onEdit={handleEdit}
              />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <h2 className="text-base font-semibold text-gray-900">CSV出力</h2>
            </CardHeader>
            <CardContent>
              <CsvActions entries={localEntries} />
            </CardContent>
          </Card>
        </div>
      </div>

      {/* テンプレートプレビューモーダル */}
      <PosterPreview
        open={preview.previewOpen}
        onClose={preview.closePreview}
        imageUrl={preview.previewImageUrl}
        templateNo={preview.previewTemplateNo}
        posterPosition={form.watch('posterPosition')}
        onPositionChange={handlePositionChange}
      />
    </div>
  );
}
