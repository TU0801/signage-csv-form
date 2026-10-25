import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Card, CardHeader, CardContent } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { Spinner } from '@/components/ui/Spinner';
import { useToast } from '@/components/ui/Toast';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { useMasterData } from '@/hooks/useMasterData';
import { useAuth } from '@/hooks/useAuth';
import { discardOwnPosterImages, uploadPosterImage } from '@/lib/storage';
import { templateFileUrl } from '@/lib/templateStorage';
import { cn, todayUtc } from '@/lib/utils';
import { PosterType } from '@/lib/constants';
import { insertEntries, type AppSettings } from '@/lib/api/single-entry';
import { fetchPortalInspections } from '@/lib/api/portal';
import { fetchVendorPropertyRequests } from '@/lib/api/property-requests';
import type { MasterData } from '@/types/app';
import type { PortalInspectionRow } from '@/types/portal';
import type { DbPropertyRequest } from '@/types/database';
import { BuildingRequestModal } from '@/features/building-requests/components/BuildingRequestModal';
import { useVendorPropertyRequests } from '@/features/building-requests/hooks/useVendorPropertyRequests';
import {
  approvedCodeMap,
  isProvisionalCode,
  provisionalBuildings,
  provisionalCode,
  provisionalMasterProperty,
} from '@/features/building-requests/lib/provisional';
import { inspectionsOfVendor } from '@/features/inspection-portal/lib/inspectionLink';
import { useAppSettings } from '@/features/single-entry/hooks/useAppSettings';
import { useEntryForm } from '@/features/single-entry/hooks/useEntryForm';
import { useVendorContext } from '@/features/single-entry/hooks/useVendorContext';
import { useSubmittedEntries } from '@/features/single-entry/hooks/useSubmittedEntries';
import { EntryForm } from '@/features/single-entry/components/EntryForm';
import { EntryDataList } from '@/features/single-entry/components/EntryDataList';
import { PosterPreview } from '@/features/single-entry/components/PosterPreview';
import { DisplaySettings } from '@/features/single-entry/components/DisplaySettings';
import { AdminVendorSelect } from '@/features/single-entry/components/AdminVendorSelect';
import { ManagementCompanyFilter } from '@/features/single-entry/components/ManagementCompanySelect';
import { useInspectionFormStore } from '@/stores/inspectionFormStore';
import { useManagementCompanies } from '@/features/single-entry/hooks/useManagementCompanies';
import { useSingleEntryStore } from '@/features/single-entry/stores/singleEntryStore';
import { HeaderSlot } from '@/components/layout/HeaderSlot';
import { resolveTemplateImageUrl } from '@/features/single-entry/lib/templateImages';
import {
  buildLocalEntry,
  buildPropertyOptions,
  entryInspectionLink,
  filterByManagementCompany,
  filterInspectionTypes,
  formatPosterDate,
  MANAGEMENT_COMPANY_NONE,
  terminalsOf,
  toInsertRow,
} from '@/features/single-entry/lib/entryLogic';
import type { LocalEntry } from '@/features/single-entry/types';


const EMPTY_ENTRIES: LocalEntry[] = [];

function errorMessage(err: unknown): string {
  if (err && typeof err === 'object' && 'message' in err) return String((err as { message: unknown }).message ?? '');
  return '';
}

/**
 * 1件入力（点検日入力）。マスターデータと設定を読み終えてから入力欄を出す。
 * 点検登録フォーム（InspectionFormPage）の「1件入力」。modeSwitch は1件入力・一括入力の切替（入力の枠の左上に出す）
 */
// v1: index.html initAuth（設定 → マスターデータ → initScript の順）
export function SingleEntryPage({ modeSwitch }: { modeSwitch?: ReactNode } = {}) {
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

  return <SingleEntryWorkspace master={master} settings={settings} modeSwitch={modeSwitch} />;
}

interface WorkspaceProps {
  master: MasterData;
  settings: AppSettings;
  modeSwitch?: ReactNode;
}

function SingleEntryWorkspace({ master, settings, modeSwitch }: WorkspaceProps) {
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

  // 保守会社の点検行（物件を選んだときの点検工事案内の既定に使う。修正依頼1024 本番確認 ②）。申請時は改めて読み直して結び付ける。
  // 読めなければ既定を入れないだけ（入力はできる）
  const [portalInspections, setPortalInspections] = useState<PortalInspectionRow[]>([]);
  useEffect(() => {
    let cancelled = false;
    fetchPortalInspections()
      .then((rows) => {
        if (!cancelled) setPortalInspections(rows);
      })
      .catch((err: unknown) => console.error('点検行の取得に失敗しました（点検工事案内の既定は入りません）:', err));
    return () => {
      cancelled = true;
    };
  }, []);
  const vendorInspections = useMemo(
    () => inspectionsOfVendor(portalInspections, isAdmin, vendorCtx.linkVendorId),
    [portalInspections, isAdmin, vendorCtx.linkVendorId],
  );

  // 未承認の建物（建物追加の申請。修正依頼1025 D4・F2）: 申請した月の間は物件の候補に出し、申請まで送れる（一括入力と同じ）。
  // 申請は仮の物件コード REQ-… と property_request_id で入り、建物の承認で正式な物件コードに付け替わる
  const buildingRequests = useVendorPropertyRequests(vendorCtx.linkVendorId);
  const provisional = useMemo(() => provisionalBuildings(buildingRequests.requests), [buildingRequests.requests]);
  const provisionalProperties = useMemo(() => provisional.map(provisionalMasterProperty), [provisional]);
  const formProperties = useMemo(
    () => (provisionalProperties.length ? [...vendorCtx.visibleProperties, ...provisionalProperties] : vendorCtx.visibleProperties),
    [vendorCtx.visibleProperties, provisionalProperties],
  );
  const [showBuildingRequest, setShowBuildingRequest] = useState(false);

  const form = useEntryForm({
    settings,
    properties: formProperties,
    inspectionTypes,
    linkedIds: vendorCtx.linkedIds,
    inspections: vendorInspections,
  });
  useEffect(() => {
    applyLinkedRef.current = form.applyLinked;
  }, [form.applyLinked]);

  const { values } = form;
  const submitted = useSubmittedEntries(user?.id ?? null);

  const [signageOnly, setSignageOnly] = useState(false);
  // 管理会社フィルター（'' = 全て。管理者と保守会社。B2）。保守会社・サイネージ設置物件のみと AND で効く。
  // 一括入力と同じ値を使う（切り替えても残す）
  const managementIndex = useManagementCompanies(true);
  const managementCompanyId = useInspectionFormStore((s) => s.managementCompanyId);
  const setManagementCompanyId = useInspectionFormStore((s) => s.setManagementCompanyId);
  const [tab, setTab] = useState<'preview' | 'settings'>('preview');
  // 作成データは store（画面を移っても残す）。別のユーザーの行は見せない
  const userId = user?.id ?? null;
  const bindUser = useSingleEntryStore((s) => s.bindUser);
  const storedEntries = useSingleEntryStore((s) => s.entries);
  const storeUserId = useSingleEntryStore((s) => s.userId);
  const setLocalEntries = useSingleEntryStore((s) => s.setEntries);
  const localEntries = storeUserId === userId ? storedEntries : EMPTY_ENTRIES;
  useEffect(() => bindUser(userId), [bindUser, userId]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [removeId, setRemoveId] = useState<string | null>(null);
  const submitting = useSingleEntryStore((s) => s.submitting);
  const setSubmitting = useSingleEntryStore((s) => s.setSubmitting);

  // 未承認の建物は申請で選んだ管理会社で絞る（業務システムの物件に無いので filterByManagementCompany では「未設定」に入ってしまう）
  const selectableFor = useCallback(
    (companyId: string) => {
      const listed = filterByManagementCompany(vendorCtx.visibleProperties, managementIndex, companyId);
      if (provisionalProperties.length === 0) return listed;
      const want = companyId === MANAGEMENT_COMPANY_NONE ? null : companyId;
      const extra = provisionalProperties.filter(
        (_, i) => !companyId || !managementIndex || provisional[i]!.managementCompanyId === want,
      );
      return [...listed, ...extra];
    },
    [vendorCtx.visibleProperties, managementIndex, provisional, provisionalProperties],
  );
  const selectableProperties = useMemo(() => selectableFor(managementCompanyId), [selectableFor, managementCompanyId]);
  const propertyOptions = useMemo(
    () => buildPropertyOptions(selectableProperties, signageOnly),
    [selectableProperties, signageOnly],
  );
  // 端末は物件に付くので全物件から引く（管理者が別の保守会社の行を編集で読み込んでも「端末なし」と出さない）
  const terminals = terminalsOf(properties, values.propertyCode);
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
    const next = buildPropertyOptions(selectableProperties, checked);
    if (values.propertyCode && !next.some((o) => o.value === values.propertyCode)) form.resetProperty();
  };

  // 管理会社を切り替えて選択中の物件が外れたら、物件の選択を外す（サイネージ設置物件のみと同じ）
  const handleManagementCompanyChange = (companyId: string) => {
    setManagementCompanyId(companyId);
    const next = selectableFor(companyId);
    if (values.propertyCode && !next.some((p) => p.property_code === values.propertyCode)) form.resetProperty();
  };

  // 編集・複製で読み込む物件が管理会社・サイネージ設置物件のみの絞り込みの外なら、絞り込みを外す
  // （物件欄に物件名が出ずコードだけ残るのを防ぐ）
  const showPropertyInFilters = (propertyCode: string) => {
    if (!selectableProperties.some((p) => p.property_code === propertyCode)) setManagementCompanyId('');
    if (signageOnly && !buildPropertyOptions(formProperties, true).some((o) => o.value === propertyCode)) {
      setSignageOnly(false);
    }
  };

  // 管理者が別の保守会社で作った行を読み込んだら知らせる（このまま追加・更新すると今の保守会社で記録される）
  const warnIfOtherVendor = (entry: LocalEntry) => {
    const current = vendorCtx.vendor?.vendor_name ?? '';
    if (!isAdmin || !entry.vendorName || entry.vendorName === current) return;
    addToast(
      `この行は別の保守会社（${entry.vendorName}）で作成しています。\nこのまま追加・更新すると今の保守会社（${current || '未選択'}）で記録されます`,
      'warning',
    );
  };

  // v1: js/script.js addEntry
  const handleAdd = () => {
    const result = buildLocalEntry(values, {
      properties: formProperties,
      inspectionTypes,
      vendor: vendorCtx.vendor,
      customImage: form.customImage,
      hasTemplateImage: (key) => templateUrlOf(key) !== null,
      settings,
      linkVendorId: vendorCtx.linkVendorId,
      isAdmin,
    });
    if (!result.ok) {
      // 表示設定タブの項目の誤りは、そのタブを開いて欄を見せる
      if (result.settingsTab) setTab('settings');
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
    showPropertyInFilters(entry.propertyCode);
    warnIfOtherVendor(entry);
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
    showPropertyInFilters(last.propertyCode);
    warnIfOtherVendor(last);
    form.duplicate(last);
    addToast('前回のデータを複製しました', 'info');
  };

  // v1: js/script.js clearForm
  const handleClear = () => {
    form.clear();
    setEditingId(null);
  };

  // 削除確認に出す行（どの行を消すのか分かるように）
  const removing = removeId ? localEntries.find((e) => e._id === removeId) : undefined;

  // v1: js/script.js submitEntries（画像をアップロードしてから、まとめて1回で INSERT。status は draft）
  const handleSubmit = async () => {
    if (useSingleEntryStore.getState().submitting) return;
    if (localEntries.length === 0) {
      addToast('申請するデータがありません', 'error');
      return;
    }
    if (!user) {
      addToast('ログインが必要です', 'error');
      return;
    }
    // 申請中に足した行を消さないよう、申請した行の _id だけを覚えておく
    const sending = localEntries;
    const sentIds = new Set(sending.map((e) => e._id));
    setSubmitting(true);
    // 申請に至らなかったときに片付ける、この申請でアップロードした画像
    let uploaded: string[] = [];
    try {
      const results = await Promise.allSettled(
        sending.map((e) => {
          if (e.posterType !== PosterType.CUSTOM || !e.customImage) return Promise.resolve(null);
          return uploadPosterImage(e.customImage.file, user.id);
        }),
      );
      const urls = results.map((r) => (r.status === 'fulfilled' ? r.value : null));
      uploaded = urls.filter((u): u is string => !!u);
      const failed = results.find((r): r is PromiseRejectedResult => r.status === 'rejected');
      if (failed) {
        console.error('Image upload failed:', failed.reason);
        throw new Error('画像のアップロードに失敗しました');
      }
      // 保守会社の点検行に一致する申請は点検に結び付ける（点検登録フォームに申請中として出て、報告書UP が通る）。
      // 点検行が読めなければ結び付けずに申請する（今までどおり）
      const fetched = await fetchPortalInspections().catch((err: unknown) => {
        console.error('点検行の取得に失敗しました（点検に結び付けずに申請します）:', err);
        return null;
      });
      const linkSkipped = fetched === null;
      const inspections = fetched ?? [];
      // 未承認の建物の行は、申請の時点の建物追加の申請で確かめる（その間に承認されていれば正式な物件コード・端末で申請する）
      const requests: DbPropertyRequest[] =
        sending.some((e) => isProvisionalCode(e.propertyCode)) && vendorCtx.linkVendorId
          ? await fetchVendorPropertyRequests(vendorCtx.linkVendorId).catch((err: unknown) => {
              console.error('建物追加の申請の取得に失敗しました:', err);
              return buildingRequests.requests;
            })
          : [];
      const approved = approvedCodeMap(requests);
      const today = todayUtc();
      await insertEntries(
        sending.map((sent, i) => {
          const to = isProvisionalCode(sent.propertyCode) ? approved.get(sent.propertyCode) : undefined;
          const e = to ? { ...sent, propertyCode: to.propertyCode, terminalId: to.terminalId } : sent;
          const requestId = isProvisionalCode(e.propertyCode)
            ? requests.find((r) => provisionalCode(r.id) === e.propertyCode)?.id
            : undefined;
          if (isProvisionalCode(e.propertyCode) && !requestId) {
            throw new Error(`「${e.propertyName}」の建物追加の申請が見つかりません。もう一度建物追加を申請してください`);
          }
          if (requestId) {
            // 建物の承認前は点検行に結び付けない（DB の guard_entry_property_request も止める）。保守会社は DB が申請の保守会社にする
            return { ...toInsertRow(e, urls[i] ?? null, user.id, settings, today, null), property_request_id: requestId };
          }
          const link = entryInspectionLink(e, inspections, isAdmin, vendorCtx.linkVendorId);
          // 点検予定に結び付いた申請は、その点検の保守会社（結び付けた会社）の社名・緊急連絡先で記録する（ユーザー決定 2026-10-25）。
          // 結び付かなければ追加した時点の保守会社（保守会社のアカウントは自社、管理者は選んだ会社）のまま
          const linked = link?.vendor_id ? vendors.find((v) => String(v.id) === String(link.vendor_id)) : undefined;
          const recorded = linked
            ? { ...e, vendorName: linked.vendor_name, emergencyContact: linked.emergency_contact || '' }
            : e;
          return toInsertRow(recorded, urls[i] ?? null, user.id, settings, today, link);
        }),
      );
      uploaded = [];
      addToast(`${sending.length}件を申請しました${linkSkipped ? '（点検予定には結び付けていません）' : ''}`, 'success');
      setLocalEntries((prev) => prev.filter((e) => !sentIds.has(e._id)));
      setEditingId((id) => (id && sentIds.has(id) ? null : id));
      submitted.refetch();
    } catch (err) {
      console.error('Submit failed:', err);
      addToast(`申請に失敗しました: ${errorMessage(err)}`, 'error');
      // 申請が入らなかったので、先にアップロードした画像はどこからも使われない（もう一度申請すると新しくアップロードする）
      void discardOwnPosterImages(uploaded, user.id);
    } finally {
      setSubmitting(false);
    }
  };

  // 建物追加を申請したら、その建物を物件に選んだ状態にする（絞り込みの外なら絞り込みを外す）。
  // 管理者がモーダルで別の保守会社を選んだときは、いま入力している保守会社の建物ではないので選ばない
  const handleBuildingRequested = (request: DbPropertyRequest) => {
    if (!vendorCtx.linkVendorId || request.vendor_id !== vendorCtx.linkVendorId) return;
    buildingRequests.addRequest(request);
    if (managementCompanyId && managementCompanyId !== request.management_company_id) setManagementCompanyId('');
    // 未承認の建物には端末が無い
    if (signageOnly) setSignageOnly(false);
    form.changeProperty(provisionalCode(request.id));
    if (request.inspection_type_id && inspectionTypes.some((t) => t.id === request.inspection_type_id)) {
      form.changeInspectionType(request.inspection_type_id);
    }
  };

  const isCustom = values.posterType === PosterType.CUSTOM;

  return (
    // 段階B（tall のときだけ）：1画面に収め、上段はカードの中身の高さ、作成データ一覧が残りを取って内部スクロールする
    // 見出しの行は1行分を取るので置かない（ユーザー指定 2026-10-15）。h1 は読み上げ用にだけ残し、クリアは入力カードの見出しへ
    <div className="space-y-3 tall:grid tall:h-[calc(100dvh-var(--header-h)-1.5rem)] tall:grid-rows-[minmax(0,auto)_minmax(9rem,1fr)] tall:gap-3 tall:space-y-0">
      {/* 管理者の保守会社選択と、管理会社フィルター（管理者・保守会社）はヘッダーに出す（780f151。ポータルなので置き場所はレイアウトに影響しない） */}
      <HeaderSlot>
        <div className="flex items-center gap-2">
          {isAdmin && (
            <AdminVendorSelect vendors={vendors} value={vendorCtx.adminVendorId} onChange={handleAdminVendorChange} />
          )}
          {managementIndex && (
            <ManagementCompanyFilter
              companies={managementIndex.companies}
              value={managementCompanyId}
              onChange={handleManagementCompanyChange}
            />
          )}
        </div>
      </HeaderSlot>

      <div className="grid grid-cols-1 gap-3 lg:grid-cols-2 tall:min-h-0 tall:grid-rows-[minmax(0,1fr)]">
        <Card className="tall:flex tall:min-h-0 tall:flex-col">
          <CardHeader className="flex items-center justify-between gap-3">
            <h1 className="sr-only">点検日入力</h1>
            <div className="flex items-center gap-3">
              {modeSwitch}
              <h2 className="text-sm font-semibold text-gray-900">
                {editingId ? '掲示内容入力（編集中）' : '掲示内容入力'}
              </h2>
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="secondary"
                size="sm"
                onClick={() => setShowBuildingRequest(true)}
                title="担当する建物が一覧に無いときに追加を申請する"
                className="border-green-300 text-green-700"
              >
                建物追加 申請
              </Button>
              <Button variant="secondary" size="sm" onClick={handleClear}>
                クリア
              </Button>
            </div>
          </CardHeader>
          <CardContent className="p-0 tall:flex tall:min-h-0 tall:flex-1 tall:flex-col">
            <EntryForm
              form={form}
              propertyOptions={propertyOptions}
              terminals={terminals}
              inspectionTypes={inspectionOptions}
              allInspectionTypes={inspectionTypes}
              linkedIds={vendorCtx.linkedIds}
              settings={settings}
              editing={editingId !== null}
              onCancelEdit={handleClear}
              signageOnly={signageOnly}
              onSignageOnlyChange={handleSignageOnlyChange}
              onAdd={handleAdd}
              onDuplicate={handleDuplicate}
              canDuplicate={localEntries.length > 0}
              onImageError={(m) => addToast(m, 'error')}
              onImageNotice={(m) => addToast(m, 'info')}
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
              <DisplaySettings form={form} displayTimeMax={settings.display_time_max} />
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
              {/* 申請済みは今月登録した分だけを出す（月が替わると前月分は一覧から外れる） */}
              <Badge>今月の申請: {submitted.entries.length}</Badge>
            </div>
            {localEntries.length > 0 && (
              <Button variant="success" size="sm" onClick={() => void handleSubmit()} disabled={submitting}>
                {submitting ? '申請中...' : '申請する'}
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent className="p-0 tall:min-h-0 tall:flex-1">
          <EntryDataList
            entries={localEntries}
            submitted={submitted.entries}
            properties={provisionalProperties.length ? [...properties, ...provisionalProperties] : properties}
            editingId={editingId}
            showVendor={isAdmin}
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
        message={
          removing
            ? `次の作成データを削除しますか？\n${removing.propertyCode} ${removing.propertyName}\n${removing.inspectionType}`
            : '削除しますか？'
        }
        confirmLabel="削除"
        variant="danger"
      />
      <BuildingRequestModal
        open={showBuildingRequest}
        onClose={() => setShowBuildingRequest(false)}
        vendorId={vendorCtx.linkVendorId}
        managementCompanyId={
          managementCompanyId && managementCompanyId !== MANAGEMENT_COMPANY_NONE ? managementCompanyId : null
        }
        onSubmitted={handleBuildingRequested}
        submittedNote="（1件入力ではその建物を物件に選びました）"
      />
    </div>
  );
}
