import { useState, useCallback } from 'react';
import { Card, CardHeader, CardContent } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Spinner } from '@/components/ui/Spinner';
import { useToast } from '@/components/ui/Toast';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { useMasterData } from '@/hooks/useMasterData';
import { useEntries } from '@/hooks/useEntries';
import { useEntryForm } from '@/features/single-entry/hooks/useEntryForm';
import { useCascadingSelects } from '@/features/single-entry/hooks/useCascadingSelects';
import { usePreview } from '@/features/single-entry/hooks/usePreview';
import { EntryForm } from '@/features/single-entry/components/EntryForm';
import { EntryDataList } from '@/features/single-entry/components/EntryDataList';
import { CsvActions } from '@/features/single-entry/components/CsvActions';
import { PosterPreview } from '@/features/single-entry/components/PosterPreview';
import { uploadPosterImage } from '@/lib/storage';
import { useAuthStore } from '@/stores/authStore';
import { EntryStatus } from '@/lib/constants';
import { AdminVendorFilter, useAdminVendorFilter } from '@/components/AdminVendorFilter';
import type { EntryFormData } from '@/types/app';

interface LocalEntry extends EntryFormData {
  _id: string;
}

export function SingleEntryPage() {
  const { addToast } = useToast();
  const { properties, vendors, inspectionTypes, categories, loading, error } = useMasterData();
  const user = useAuthStore((s) => s.user);
  const { createEntry } = useEntries();
  const [submitting, setSubmitting] = useState(false);
  const [showSubmitConfirm, setShowSubmitConfirm] = useState(false);
  const adminFilter = useAdminVendorFilter();

  // 管理者ベンダーフィルタ適用
  const filteredProperties = adminFilter.filterProperties(properties);

  const { form, resetForm } = useEntryForm();
  const { setValue, reset } = form;

  const cascading = useCascadingSelects({
    setValue,
    properties: filteredProperties,
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
    async (data: EntryFormData, customImageFile?: File) => {
      let formData = { ...data };

      // カスタム画像のアップロード
      if (customImageFile && formData.posterType === 'custom' && user) {
        try {
          const url = await uploadPosterImage(customImageFile, user.id);
          formData = { ...formData, customPosterUrl: url };
        } catch (err) {
          addToast(
            err instanceof Error ? err.message : '画像アップロードに失敗しました',
            'error',
          );
          return;
        }
      }

      if (editingId) {
        setLocalEntries((prev) =>
          prev.map((e) => (e._id === editingId ? { ...formData, _id: editingId } : e)),
        );
        setEditingId(null);
        addToast('エントリーを更新しました', 'success');
      } else {
        const newEntry: LocalEntry = {
          ...formData,
          _id: crypto.randomUUID(),
        };
        setLocalEntries((prev) => [...prev, newEntry]);
        addToast('エントリーを追加しました', 'success');
      }
      resetForm();
    },
    [editingId, resetForm, addToast, user],
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

  /** 前回を複製 */
  const handleDuplicate = useCallback(() => {
    if (localEntries.length === 0) {
      addToast('複製するエントリーがありません', 'warning');
      return;
    }
    const last = localEntries[localEntries.length - 1]!;
    const inspType = inspectionTypes.find(
      (t) => t.inspection_name === last.inspectionType,
    );

    setValue('propertyCode', last.propertyCode);
    cascading.handlePropertyChange(last.propertyCode);

    // cascade 連動の完了後にフィールドをセット
    setTimeout(() => {
      setValue('terminalId', last.terminalId);
      setValue('vendorName', last.vendorName);

      const vendor = vendors.find((v) => v.vendor_name === last.vendorName);
      setValue('emergencyContact', vendor?.emergency_contact ?? '');

      if (inspType?.category_id) {
        cascading.handleCategoryChange(inspType.category_id);
      }

      setTimeout(() => {
        setValue('inspectionType', last.inspectionType);
        if (inspType) {
          setValue('templateNo', inspType.template_no);
        }
        setValue('startDate', last.startDate);
        setValue('endDate', last.endDate);
        setValue('posterType', last.posterType);

        addToast('前回のデータを複製しました', 'info');
      }, 100);
    }, 100);
  }, [localEntries, setValue, cascading, vendors, inspectionTypes, addToast]);

  /** Supabase一括保存（申請する） */
  const handleBatchSubmit = useCallback(async () => {
    if (!user) {
      addToast('ログインが必要です', 'error');
      return;
    }
    if (localEntries.length === 0) {
      addToast('エントリーがありません', 'warning');
      return;
    }

    setSubmitting(true);

    const results = await Promise.allSettled(
      localEntries.map((entry) =>
        createEntry({
          user_id: user.id,
          property_code: entry.propertyCode,
          terminal_id: entry.terminalId,
          vendor_name: entry.vendorName,
          emergency_contact: entry.emergencyContact || null,
          inspection_type: entry.inspectionType,
          template_no: entry.templateNo || null,
          inspection_start: entry.startDate || null,
          inspection_end: entry.endDate || null,
          display_start_date: entry.displayStartDate || null,
          display_start_time: entry.displayStartTime || null,
          display_end_date: entry.displayEndDate || null,
          display_end_time: entry.displayEndTime || null,
          display_duration: entry.displayDuration || null,
          announcement: entry.noticeText || null,
          remarks: entry.remarks || null,
          poster_type: entry.posterType || null,
          poster_position: entry.posterPosition || null,
          frame_no: entry.frameNo || null,
          status: EntryStatus.DRAFT,
          poster_image: entry.customPosterUrl || null,
        }),
      ),
    );

    const successCount = results.filter((r) => r.status === 'fulfilled').length;
    const errorCount = results.filter((r) => r.status === 'rejected').length;

    setSubmitting(false);

    if (successCount > 0) {
      addToast(`${successCount}件を申請しました`, 'success');
      if (errorCount === 0) {
        setLocalEntries([]);
        setEditingId(null);
        resetForm();
      }
    }
    if (errorCount > 0) {
      addToast(`${errorCount}件の申請に失敗しました`, 'error');
    }
  }, [user, localEntries, createEntry, addToast, resetForm]);

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

      <AdminVendorFilter
        vendors={vendors}
        onVendorFilter={adminFilter.setSelectedVendorId}
      />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* 左: フォーム */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <h2 className="text-base font-semibold text-gray-900">
                {editingId ? 'エントリー編集' : 'エントリー入力'}
              </h2>
              <Button
                variant="secondary"
                size="sm"
                onClick={handleDuplicate}
                disabled={localEntries.length === 0}
              >
                前回を複製
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            <EntryForm
              form={form}
              properties={filteredProperties}
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
              <h2 className="text-base font-semibold text-gray-900">申請・CSV出力</h2>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <Button
                  variant="primary"
                  onClick={() => setShowSubmitConfirm(true)}
                  disabled={localEntries.length === 0 || submitting}
                  className="w-full"
                >
                  {submitting ? '送信中...' : `申請する (${localEntries.length}件)`}
                </Button>
                <CsvActions entries={localEntries} />
              </div>
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

      {/* 申請確認ダイアログ */}
      <ConfirmDialog
        open={showSubmitConfirm}
        onClose={() => setShowSubmitConfirm(false)}
        onConfirm={handleBatchSubmit}
        title="申請確認"
        message={`${localEntries.length}件のエントリーを申請しますか？`}
        confirmLabel="申請する"
      />
    </div>
  );
}
