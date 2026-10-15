import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Card, CardHeader, CardContent } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { Spinner } from '@/components/ui/Spinner';
import { useToast } from '@/components/ui/Toast';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { useMasterData } from '@/hooks/useMasterData';
import { useAuth } from '@/hooks/useAuth';
import { uploadPosterImage } from '@/lib/storage';
import { templateFileUrl } from '@/lib/templateStorage';
import { cn, todayUtc } from '@/lib/utils';
import { PosterType } from '@/lib/constants';
import { insertEntries, type AppSettings } from '@/lib/api/single-entry';
import type { MasterData } from '@/types/app';
import { useAppSettings } from '@/features/single-entry/hooks/useAppSettings';
import { useEntryForm } from '@/features/single-entry/hooks/useEntryForm';
import { useVendorContext } from '@/features/single-entry/hooks/useVendorContext';
import { useSubmittedEntries } from '@/features/single-entry/hooks/useSubmittedEntries';
import { EntryForm } from '@/features/single-entry/components/EntryForm';
import { EntryDataList } from '@/features/single-entry/components/EntryDataList';
import { PosterPreview } from '@/features/single-entry/components/PosterPreview';
import { DisplaySettings } from '@/features/single-entry/components/DisplaySettings';
import { AdminVendorSelect } from '@/features/single-entry/components/AdminVendorSelect';
import { HeaderSlot } from '@/components/layout/HeaderSlot';
import { resolveTemplateImageUrl } from '@/features/single-entry/lib/templateImages';
import {
  buildLocalEntry,
  buildPropertyOptions,
  filterInspectionTypes,
  formatPosterDate,
  terminalsOf,
  toInsertRow,
} from '@/features/single-entry/lib/entryLogic';
import type { LocalEntry } from '@/features/single-entry/types';


function errorMessage(err: unknown): string {
  if (err && typeof err === 'object' && 'message' in err) return String((err as { message: unknown }).message ?? '');
  return '';
}

/** 1件入力（点検日入力）。マスターデータと設定を読み終えてから入力欄を出す */
// v1: index.html initAuth（設定 → マスターデータ → initScript の順）
export function SingleEntryPage() {
  const master = useMasterData();
  const settings = useAppSettings();

  if (master.loading || !settings) {
    return (
      <div className="flex items-center justify-center py-12">
        <Spinner size="lg" />
      </div>
    );
  }

  if (master.error) {
    return (
      <div className="py-12 text-center text-red-600">
        <p>マスターデータの読み込みに失敗しました</p>
        <p className="mt-1 text-sm">{master.error}</p>
      </div>
    );
  }

  return <SingleEntryWorkspace master={master} settings={settings} />;
}

interface WorkspaceProps {
  master: MasterData;
  settings: AppSettings;
}

function SingleEntryWorkspace({ master, settings }: WorkspaceProps) {
  const { addToast } = useToast();
  const { user, profile, isAdmin } = useAuth();
  const { properties, vendors, inspectionTypes, templateImages } = master;

  // 紐付けを読み終えたらフォームへ反映する（フォームより先に作るので ref 経由で渡す）
  const applyLinkedRef = useRef<(ids: ReadonlySet<string>) => void>(() => {});
  const onLinkedLoaded = useCallback((ids: ReadonlySet<string>) => applyLinkedRef.current(ids), []);

  const vendorCtx = useVendorContext({
    isAdmin,
    profileVendorId: profile?.vendor_id ?? null,
    properties,
    vendors,
    onLinkedLoaded,
  });

  const form = useEntryForm({
    settings,
    properties: vendorCtx.visibleProperties,
    inspectionTypes,
    linkedIds: vendorCtx.linkedIds,
  });
  useEffect(() => {
    applyLinkedRef.current = form.applyLinked;
  }, [form.applyLinked]);

  const { values } = form;
  const submitted = useSubmittedEntries(user?.id ?? null);

  const [signageOnly, setSignageOnly] = useState(false);
  const [tab, setTab] = useState<'preview' | 'settings'>('preview');
  const [localEntries, setLocalEntries] = useState<LocalEntry[]>([]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [removeId, setRemoveId] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const propertyOptions = useMemo(
    () => buildPropertyOptions(vendorCtx.visibleProperties, signageOnly),
    [vendorCtx.visibleProperties, signageOnly],
  );
  const terminals = terminalsOf(vendorCtx.visibleProperties, values.propertyCode);
  const inspectionOptions = useMemo(
    () => filterInspectionTypes(inspectionTypes, values.category, vendorCtx.linkedIds),
    [inspectionTypes, values.category, vendorCtx.linkedIds],
  );

  const templateUrlOf = useCallback(
    (key: string) => resolveTemplateImageUrl(key, templateImages, templateFileUrl),
    [templateImages],
  );

  // v1: js/script.js onAdminVendorChange
  // v1 は選択を外したときマスターデータを取り直すが、useMasterData.refetch は loading を立てて入力欄ごと
  // 外す（未送信の行が消える）ため呼ばない。読み込み済みの物件一覧へ戻す（セッション中にマスターが変わらない限り同じ結果）
  const handleAdminVendorChange = (vendorId: string) => {
    vendorCtx.selectAdminVendor(vendorId);
    if (vendorId) form.resetProperty();
    else form.clearVendor();
  };

  // v1: js/script.js populatePropertySelect（フィルター切替で消えた物件は選択を外す）
  const handleSignageOnlyChange = (checked: boolean) => {
    setSignageOnly(checked);
    const next = buildPropertyOptions(vendorCtx.visibleProperties, checked);
    if (values.propertyCode && !next.some((o) => o.value === values.propertyCode)) form.resetProperty();
  };

  // v1: js/script.js addEntry
  const handleAdd = () => {
    const result = buildLocalEntry(values, {
      properties: vendorCtx.visibleProperties,
      inspectionTypes,
      vendor: vendorCtx.vendor,
      customImage: form.customImage,
      hasTemplateImage: (key) => templateUrlOf(key) !== null,
      settings,
    });
    if (!result.ok) {
      addToast(result.message, 'error');
      return;
    }
    if (editingId) {
      setLocalEntries((prev) => prev.map((e) => (e._id === editingId ? { ...result.entry, _id: editingId } : e)));
      setEditingId(null);
      addToast('更新しました', 'success');
    } else {
      setLocalEntries((prev) => [...prev, { ...result.entry, _id: crypto.randomUUID() }]);
      addToast('追加しました', 'success');
    }
  };

  // v1: js/script.js editEntry
  const handleEdit = (id: string) => {
    const entry = localEntries.find((e) => e._id === id);
    if (!entry) return;
    form.loadEntry(entry);
    setEditingId(id);
  };

  // v1: js/script.js deleteEntry
  const handleRemoveConfirmed = () => {
    if (!removeId) return;
    setLocalEntries((prev) => prev.filter((e) => e._id !== removeId));
    if (editingId === removeId) setEditingId(null);
    setRemoveId(null);
    addToast('削除しました', 'info');
  };

  // v1: js/script.js duplicateLastEntry
  const handleDuplicate = () => {
    const last = localEntries[localEntries.length - 1];
    if (!last) return;
    form.duplicate(last);
    addToast('前回のデータを複製しました', 'info');
  };

  // v1: js/script.js clearForm
  const handleClear = () => {
    form.clear();
    setEditingId(null);
  };

  // v1: js/script.js submitEntries（画像をアップロードしてから、まとめて1回で INSERT。status は draft）
  const handleSubmit = async () => {
    if (localEntries.length === 0) {
      addToast('確定するデータがありません', 'error');
      return;
    }
    if (!user) {
      addToast('ログインが必要です', 'error');
      return;
    }
    setSubmitting(true);
    try {
      const urls = await Promise.all(
        localEntries.map((e) => {
          if (e.posterType !== PosterType.CUSTOM || !e.customImage) return Promise.resolve(null);
          return uploadPosterImage(e.customImage.file, user.id).catch((uploadError: unknown) => {
            console.error('Image upload failed:', uploadError);
            return Promise.reject(new Error('画像のアップロードに失敗しました'));
          });
        }),
      );
      const today = todayUtc();
      await insertEntries(localEntries.map((e, i) => toInsertRow(e, urls[i] ?? null, user.id, settings, today)));
      addToast(`${localEntries.length}件のデータを確定しました`, 'success');
      setLocalEntries([]);
      setEditingId(null);
      submitted.refetch();
    } catch (err) {
      console.error('Submit failed:', err);
      addToast(`確定に失敗しました: ${errorMessage(err)}`, 'error');
    } finally {
      setSubmitting(false);
    }
  };

  const isCustom = values.posterType === PosterType.CUSTOM;

  return (
    // 段階B（tall のときだけ）：1画面に収め、上段はカードの中身の高さ、作成データ一覧が残りを取って内部スクロールする
    // 見出しの行は1行分を取るので置かない（ユーザー指定 2026-10-15）。h1 は読み上げ用にだけ残し、クリアは入力カードの見出しへ
    <div className="space-y-3 tall:grid tall:h-[calc(100dvh-var(--header-h)-1.5rem)] tall:grid-rows-[minmax(0,auto)_minmax(9rem,1fr)] tall:gap-3 tall:space-y-0">
      {/* 管理者の保守会社選択はヘッダーに出す（780f151。ポータルなので置き場所はレイアウトに影響しない） */}
      {isAdmin && (
        <HeaderSlot>
          <AdminVendorSelect vendors={vendors} value={vendorCtx.adminVendorId} onChange={handleAdminVendorChange} />
        </HeaderSlot>
      )}

      <div className="grid grid-cols-1 gap-3 lg:grid-cols-2 tall:min-h-0 tall:grid-rows-[minmax(0,1fr)]">
        <Card className="tall:flex tall:min-h-0 tall:flex-col">
          <CardHeader className="flex items-center justify-between gap-3">
            <h1 className="sr-only">点検日入力</h1>
            <h2 className="text-sm font-semibold text-gray-900">
              {editingId ? '掲示内容入力（編集中）' : '掲示内容入力'}
            </h2>
            <Button variant="secondary" size="sm" onClick={handleClear}>
              クリア
            </Button>
          </CardHeader>
          <CardContent className="p-0 tall:flex tall:min-h-0 tall:flex-1 tall:flex-col">
            <EntryForm
              form={form}
              propertyOptions={propertyOptions}
              terminals={terminals}
              inspectionTypes={inspectionOptions}
              signageOnly={signageOnly}
              onSignageOnlyChange={handleSignageOnlyChange}
              onAdd={handleAdd}
              onDuplicate={handleDuplicate}
              canDuplicate={localEntries.length > 0}
              onImageError={(m) => addToast(m, 'error')}
            />
          </CardContent>
        </Card>

        <Card className="tall:flex tall:min-h-0 tall:flex-col">
          <div className="flex shrink-0 border-b border-gray-200" role="tablist">
            {(
              [
                ['preview', '貼紙プレビュー'],
                ['settings', '表示設定'],
              ] as const
            ).map(([key, label]) => (
              <button
                key={key}
                type="button"
                role="tab"
                aria-selected={tab === key}
                onClick={() => setTab(key)}
                className={cn(
                  'flex-1 px-3 py-2 text-sm font-medium',
                  tab === key ? 'border-b-2 border-blue-600 text-blue-700' : 'text-gray-600 hover:bg-gray-50',
                )}
              >
                {label}
              </button>
            ))}
          </div>
          <CardContent className="tall:min-h-0 tall:flex-1 tall:overflow-y-auto">
            {tab === 'preview' ? (
              <PosterPreview
                templateImageUrl={templateUrlOf(values.templateNo)}
                templateNo={values.templateNo}
                isCustom={isCustom}
                customImageUrl={form.customImage?.dataUrl ?? null}
                noticeText={values.noticeText}
                dateText={formatPosterDate(values.startDate, values.endDate)}
                remarks={values.remarks}
                vendorName={vendorCtx.vendor?.vendor_name ?? ''}
                emergencyContact={vendorCtx.vendor?.emergency_contact ?? ''}
              />
            ) : (
              <DisplaySettings form={form} />
            )}
          </CardContent>
        </Card>
      </div>

      <Card className="tall:flex tall:min-h-0 tall:flex-col">
        <CardHeader className="shrink-0">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <h2 className="text-sm font-semibold text-gray-900">作成データ</h2>
              <Badge variant="primary">{localEntries.length}</Badge>
              <Badge>申請済: {submitted.entries.length}</Badge>
            </div>
            {localEntries.length > 0 && (
              <Button variant="success" size="sm" onClick={() => void handleSubmit()} disabled={submitting}>
                {submitting ? '確定中...' : '申請する'}
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent className="p-0 tall:min-h-0 tall:flex-1">
          <EntryDataList
            entries={localEntries}
            submitted={submitted.entries}
            properties={properties}
            onEdit={handleEdit}
            onRemove={setRemoveId}
          />
        </CardContent>
      </Card>

      <ConfirmDialog
        open={removeId !== null}
        onClose={() => setRemoveId(null)}
        onConfirm={handleRemoveConfirmed}
        title="削除確認"
        message="削除しますか？"
        confirmLabel="削除"
        variant="danger"
      />
    </div>
  );
}
