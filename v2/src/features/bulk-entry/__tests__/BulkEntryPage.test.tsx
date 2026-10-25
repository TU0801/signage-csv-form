import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { useState, type ReactNode } from 'react';
import { render, screen, fireEvent, waitFor, act, cleanup, within } from '@testing-library/react';
import { ToastProvider } from '@/components/ui/Toast';
import { HeaderSlotContext } from '@/components/layout/HeaderSlot';
import { useAuthStore } from '@/stores/authStore';
import { useBulkStore, resetBulkSession } from '@/stores/bulkStore';
import { BulkEntryPage } from '@/pages/BulkEntryPage';
import type { MasterData } from '@/types/app';
import type { DbProfile, DbProperty } from '@/types/database';
import { createMemoryStorage } from './memoryStorage';
import { makeEntry, makeInspection } from '@/features/inspection-portal/__tests__/fixtures';

const api = vi.hoisted(() => ({
  fetchAllMasterData: vi.fn(),
  getAssignedBuildings: vi.fn(),
  fetchBulkSettings: vi.fn(),
  createBulkEntries: vi.fn(),
}));
vi.mock('@/lib/api/masterData', () => ({ fetchAllMasterData: api.fetchAllMasterData }));
vi.mock('@/lib/api/relationships', () => ({ getAssignedBuildings: api.getAssignedBuildings }));
vi.mock('@/lib/api/bulk-entry', () => ({
  fetchBulkSettings: api.fetchBulkSettings,
  createBulkEntries: api.createBulkEntries,
}));
vi.mock('@/lib/supabase', () => ({ supabase: { auth: {} }, TABLES: {}, RPC: {} }));
// 未承認の建物（建物追加の申請。修正依頼1025 F2）は無い
vi.mock('@/lib/api/property-requests', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/api/property-requests')>()),
  fetchVendorPropertyRequests: async () => [],
}));
// 点検の予定（portal_*）・完了連絡・管理会社の候補（修正依頼1024）
const portalApi = vi.hoisted(() => ({
  fetchPortalInspections: vi.fn(),
  fetchPortalEntries: vi.fn(),
  fetchInspectionReports: vi.fn(),
  // 号機・点検種別の印・管理会社の略称（修正依頼1025 form）
  fetchPortalInspectionUnits: vi.fn(),
  fetchInspectionTypeFlags: vi.fn(),
  fetchManagementCompanyShortNames: vi.fn(),
}));
vi.mock('@/lib/api/portal', () => portalApi);
const formApi = vi.hoisted(() => ({
  fetchCompletions: vi.fn(),
  fetchEntryMemos: vi.fn(async () => new Map<string, string>()),
  fetchInspectionDates: vi.fn(),
  fetchScopedManagementCompanies: vi.fn(),
  markCompleted: vi.fn(),
  unmarkCompleted: vi.fn(),
}));
vi.mock('@/lib/api/inspection-form', () => formApi);

// 実DBの列に合わせたマスター（signage_master_properties / signage_master_vendors / signage_master_inspection_types）
const masterData: MasterData = {
  properties: [
    { id: 'p1', property_code: 'z0001A01', property_name: '物件A', terminals: [{ terminal_id: 'T-A1', supplement: '' }], inspections: [] },
    { id: 'p2', property_code: 'z0002A01', property_name: '端末なし物件', terminals: [], inspections: [] },
  ],
  vendors: [
    { id: 'v1', vendor_name: 'A社', emergency_contact: '092-000-0000', inspection_type: null, created_at: null },
    { id: 'v2', vendor_name: 'B社', emergency_contact: null, inspection_type: null, created_at: null },
  ],
  inspectionTypes: [
    {
      id: 'i1',
      inspection_name: '消防設備点検',
      template_no: '7',
      template_image: null,
      default_text: '定型文',
      category_id: null,
      category: null,
      show_on_board: true,
      sort_order: 1,
      created_at: null,
    },
  ],
  categories: [],
  templateImages: [],
};

const vendorBuildings: Pick<DbProperty, 'id' | 'property_code' | 'property_name' | 'terminals' | 'equipment' | 'created_at'>[] = [
  // 実DBの terminals 要素は {terminalId, supplement} と {terminal_id, supplement} が混在する
  {
    id: 'p3',
    property_code: 'z0003A01',
    property_name: 'B社物件',
    terminals: [
      { terminalId: 'T-C1', supplement: '' },
      { terminal_id: 'T-C2', supplement: 'EV' },
    ],
    equipment: [],
    created_at: null,
  },
  { id: 'p4', property_code: 'z0004A01', property_name: 'B社端末なし', terminals: [], equipment: [], created_at: null },
];

const adminProfile: DbProfile = {
  id: 'admin-1',
  email: 'admin@example.com',
  company_name: null,
  role: 'admin',
  vendor_id: null,
  status: 'active',
  created_at: null,
  updated_at: null,
};


/** 管理者の保守会社セレクトはヘッダー（UserLayout）に出るので、差し込み先を用意する */
function WithHeaderSlot({ children }: { children: ReactNode }) {
  const [target, setTarget] = useState<HTMLElement | null>(null);
  return (
    <HeaderSlotContext.Provider value={{ target, setTarget }}>
      <div ref={setTarget} />
      {children}
    </HeaderSlotContext.Provider>
  );
}

describe('BulkEntryPage (v1 js/bulk.js init / adminVendorSelect)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal('localStorage', createMemoryStorage());
    // jsdom の <dialog> は showModal/close を持たないことがある
    HTMLDialogElement.prototype.showModal ??= function (this: HTMLDialogElement) {
      this.open = true;
    };
    HTMLDialogElement.prototype.close ??= function (this: HTMLDialogElement) {
      this.open = false;
    };
    api.fetchAllMasterData.mockResolvedValue(masterData);
    api.fetchBulkSettings.mockResolvedValue([{ setting_key: 'display_time_default', setting_value: '10' }]);
    api.getAssignedBuildings.mockResolvedValue(vendorBuildings);
    useAuthStore.setState({ user: { id: 'admin-1' } as never, profile: adminProfile });
    portalApi.fetchPortalInspections.mockResolvedValue([]);
    portalApi.fetchPortalEntries.mockResolvedValue([]);
    portalApi.fetchInspectionReports.mockResolvedValue([]);
    portalApi.fetchPortalInspectionUnits.mockResolvedValue([]);
    portalApi.fetchInspectionTypeFlags.mockResolvedValue([]);
    portalApi.fetchManagementCompanyShortNames.mockResolvedValue([]);
    formApi.fetchCompletions.mockResolvedValue([]);
    formApi.fetchInspectionDates.mockResolvedValue([]);
    formApi.fetchScopedManagementCompanies.mockResolvedValue([]);
  });
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
    useAuthStore.setState({ user: null, profile: null });
    resetBulkSession();
  });

  const renderPage = () =>
    render(
      <ToastProvider>
        <WithHeaderSlot>
          <BulkEntryPage />
        </WithHeaderSlot>
      </ToastProvider>,
    );

  it('admin vendor selection narrows properties to that vendor (keeping properties without terminals) and clears rows', async () => {
    renderPage();
    const vendorSelect = await screen.findByLabelText('保守会社を選択');
    await waitFor(() => expect(useBulkStore.getState().masterData.properties).toHaveLength(1));
    // 初期表示は端末のある物件だけ（v1 getAllMasterDataCamelCase の既定）
    expect(useBulkStore.getState().masterData.properties[0]!.propertyCode).toBe('z0001A01');

    act(() => {
      useBulkStore.getState().addRow({ propertyCode: 'z0001A01' });
    });
    // 行があるときは消える前に確認する。キャンセルなら何も変えない
    fireEvent.change(vendorSelect, { target: { value: 'v2' } });
    expect(await screen.findByText(/入力中の1行は消えます/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'キャンセル' }));
    await waitFor(() => expect(screen.queryByText(/入力中の1行は消えます/)).not.toBeInTheDocument());
    expect(useBulkStore.getState().currentVendor).toEqual({ id: null, name: null });
    expect(useBulkStore.getState().rows).toHaveLength(1);
    expect(api.getAssignedBuildings).not.toHaveBeenCalled();

    fireEvent.change(vendorSelect, { target: { value: 'v2' } });
    fireEvent.click(await screen.findByRole('button', { name: 'OK' }));

    await waitFor(() => expect(useBulkStore.getState().currentVendor).toEqual({ id: 'v2', name: 'B社' }));
    expect(api.getAssignedBuildings).toHaveBeenCalledWith({ role: 'user', vendor_id: 'v2' });
    expect(useBulkStore.getState().masterData.properties.map((p) => [p.propertyCode, p.terminalId])).toEqual([
      ['z0003A01', 'T-C1'],
      ['z0003A01', 'T-C2'],
      ['z0004A01', ''],
    ]);
    expect(useBulkStore.getState().rows).toHaveLength(0);
  });

  it('toolbar and keyboard shortcuts stay disabled until master data has loaded (v1 js/bulk.js init)', async () => {
    let resolveMaster: (v: MasterData) => void = () => {};
    api.fetchAllMasterData.mockReturnValue(new Promise<MasterData>((r) => (resolveMaster = r)));
    renderPage();
    const addButton = screen.getByRole('button', { name: '+ 行を追加' });
    expect(addButton).toBeDisabled();
    fireEvent.keyDown(document, { key: 'Enter', ctrlKey: true });
    expect(useBulkStore.getState().rows).toHaveLength(0);

    await act(async () => resolveMaster(masterData));
    await waitFor(() => expect(addButton).toBeEnabled());
    fireEvent.keyDown(document, { key: 'Enter', ctrlKey: true });
    // 設定の表示時間（10）で作られる
    expect(useBulkStore.getState().rows[0]!.displayTime).toBe(10);
  });

  it('shows a reload button when master data fails to load, and loads again from it', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    api.fetchAllMasterData.mockRejectedValueOnce(new Error('network'));
    renderPage();
    expect(screen.getByText('マスターデータを読み込み中…')).toBeInTheDocument();
    fireEvent.click(await screen.findByRole('button', { name: '再読み込み' }));
    expect(await screen.findByRole('button', { name: '行を追加して始める' })).toBeEnabled();
    expect(api.fetchAllMasterData).toHaveBeenCalledTimes(2);
    consoleError.mockRestore();
  });

  it('admin cannot submit until a vendor is chosen; CSV stays available', async () => {
    renderPage();
    await waitFor(() => expect(useBulkStore.getState().sessionLoaded).toBe(true));
    act(() => {
      useBulkStore.getState().addRow({ propertyCode: 'z0001A01', inspectionType: '消防設備点検' });
    });
    expect(screen.getByRole('button', { name: '↑ 申請する' })).toBeDisabled();
    expect(screen.getByText('ヘッダーで保守会社を選んでください')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'CSVダウンロード' })).toBeEnabled();
  });

  it('エラーの行があれば申請を止め、件数と最初のエラーを知らせてそのセルへ移る（B7）', async () => {
    api.createBulkEntries.mockResolvedValue([]);
    renderPage();
    fireEvent.change(await screen.findByLabelText('保守会社を選択'), { target: { value: 'v2' } });
    await waitFor(() => expect(useBulkStore.getState().masterData.properties).toHaveLength(3));
    await waitFor(() => expect(useBulkStore.getState().sessionLoaded).toBe(true));
    act(() => {
      useBulkStore.getState().addRow({ propertyCode: 'z0003A01', inspectionType: '消防設備点検' });
      // 端末の無い物件は端末エラー。端末の列は無いので物件の下に出す（B8）
      useBulkStore.getState().addRow({ propertyCode: 'z0004A01', inspectionType: '消防設備点検' });
    });
    expect(screen.getByText('端末未設置')).toBeInTheDocument();
    // 表示フィルター・状態の列は無い（B7）
    expect(screen.queryByRole('columnheader', { name: '状態' })).toBeNull();
    expect(screen.queryByRole('columnheader', { name: '端末' })).toBeNull();
    // 列の並びは注記の配置どおり（ステータス・報告書UP・完了連絡 → No（対象月）→ 点検月/検査月 → 物件。F15）。
    // 点検月と検査月は1列に上下2段（修正依頼1025 F4）
    const heads = screen.getAllByRole('columnheader').map((h) => h.textContent ?? '');
    const at = (label: string) => heads.findIndex((h) => h.startsWith(label));
    expect([at('ステータス'), at('報告書UP'), at('No'), at('点検月検査月'), at('物件')]).toEqual([1, 2, 3, 4, 5]);

    fireEvent.click(screen.getByRole('button', { name: '↑ 申請する' }));
    expect(await screen.findByText(/入力にエラーがある行が1件あります/)).toBeInTheDocument();
    expect(screen.getByText(/2行目: 端末未設置の物件です/)).toBeInTheDocument();
    expect(api.createBulkEntries).not.toHaveBeenCalled();
    const errorRowId = useBulkStore.getState().rows[1]!.id;
    await waitFor(() =>
      expect(document.activeElement?.closest('tr')?.getAttribute('data-row-id')).toBe(String(errorRowId)),
    );

    // エラーの行を消すと申請できる。エラーのトーストも消える（修正依頼1024 本番確認: 直した後も残っていた）
    act(() => useBulkStore.getState().removeRows([errorRowId]));
    await waitFor(() => expect(screen.queryByText(/入力にエラーがある行が1件あります/)).toBeNull());
    fireEvent.click(screen.getByRole('button', { name: '↑ 申請する' }));
    await waitFor(() => expect(api.createBulkEntries).toHaveBeenCalledTimes(1));
    expect(api.createBulkEntries.mock.calls[0]![0]).toHaveLength(1);
    await waitFor(() => expect(useBulkStore.getState().rows).toHaveLength(0));
  });

  it('エラーのトーストは、その行を直したとき・画面を離れた（1件入力へ切り替えた）ときに消える', async () => {
    const view = renderPage();
    fireEvent.change(await screen.findByLabelText('保守会社を選択'), { target: { value: 'v2' } });
    await waitFor(() => expect(useBulkStore.getState().masterData.properties).toHaveLength(3));
    await waitFor(() => expect(useBulkStore.getState().sessionLoaded).toBe(true));
    act(() => {
      useBulkStore.getState().addRow({ propertyCode: 'z0003A01', inspectionType: '消防設備点検' });
      useBulkStore.getState().addRow({ propertyCode: 'z0004A01', inspectionType: '消防設備点検' });
    });
    fireEvent.click(screen.getByRole('button', { name: '↑ 申請する' }));
    expect(await screen.findByText(/入力にエラーがある行が1件あります/)).toBeInTheDocument();
    // 端末のある物件に直すと消える
    const errorRowId = useBulkStore.getState().rows[1]!.id;
    act(() => useBulkStore.getState().changeProperty(errorRowId, 'z0003A01'));
    await waitFor(() => expect(screen.queryByText(/入力にエラーがある行が1件あります/)).toBeNull());

    // もう一度エラーにして出し、一括入力の画面を離れると消える（トーストは画面の外の ToastProvider に残るため）
    act(() => useBulkStore.getState().changeProperty(errorRowId, 'z0004A01'));
    fireEvent.click(screen.getByRole('button', { name: '↑ 申請する' }));
    expect(await screen.findByText(/入力にエラーがある行が1件あります/)).toBeInTheDocument();
    view.rerender(
      <ToastProvider>
        <WithHeaderSlot>
          <p>1件入力</p>
        </WithHeaderSlot>
      </ToastProvider>,
    );
    await waitFor(() => expect(screen.queryByText(/入力にエラーがある行が1件あります/)).toBeNull());
  });

  it('申請に失敗したエラーのトーストは、次に申請できたときに消える', async () => {
    api.createBulkEntries.mockRejectedValueOnce({ message: '通信が切れました' }).mockResolvedValueOnce([]);
    renderPage();
    fireEvent.change(await screen.findByLabelText('保守会社を選択'), { target: { value: 'v2' } });
    await waitFor(() => expect(useBulkStore.getState().masterData.properties).toHaveLength(3));
    await waitFor(() => expect(useBulkStore.getState().sessionLoaded).toBe(true));
    act(() => {
      useBulkStore.getState().addRow({ propertyCode: 'z0003A01', inspectionType: '消防設備点検' });
    });
    fireEvent.click(screen.getByRole('button', { name: '↑ 申請する' }));
    expect(await screen.findByText('申請に失敗しました: 通信が切れました')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '↑ 申請する' }));
    await waitFor(() => expect(api.createBulkEntries).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(screen.queryByText('申請に失敗しました: 通信が切れました')).toBeNull());
  });

  describe('点検予定の行（保守会社のアカウント。B13・B14）', () => {
    const vendorProfile: DbProfile = { ...adminProfile, id: 'user-1', role: 'user', vendor_id: 'v1' };
    beforeEach(() => {
      vi.useFakeTimers({ toFake: ['Date'] });
      // 日本時間 2026-10-21
      vi.setSystemTime(new Date('2026-10-21T03:00:00Z'));
      useAuthStore.setState({ user: { id: 'user-1' } as never, profile: vendorProfile });
      // 点検月 5・11（4月登録）→ 5月は超過、11月はこれから
      portalApi.fetchPortalInspections.mockResolvedValue([
        makeInspection({ property_code: 'z0001A01', property_name: '物件A', inspection_type_label: '消防設備点検', vendor_id: 'v1' }),
      ]);
      formApi.fetchInspectionDates.mockResolvedValue([{ inspection_id: 'i1', inspected_on: '2026-04-01' }]);
    });
    afterEach(() => vi.useRealTimers());

    const rowOf = (month: string) =>
      screen.getAllByTestId('target-month').find((el) => el.textContent === month)!.closest('tr')!;

    it('予定を対象月・ステータス・点検月・検査月つきで出し、点検開始日を入れた行だけを点検行に結び付けて申請する', async () => {
      api.createBulkEntries.mockResolvedValue([]);
      renderPage();
      await waitFor(() => expect(screen.getAllByTestId('target-month')).toHaveLength(2));
      const may = rowOf('2026年5月');
      const nov = rowOf('2026年11月');
      expect(within(may).getByText('点検月超過')).toBeInTheDocument();
      expect(within(nov).getByText('未申請')).toBeInTheDocument();
      expect(within(nov).getByText('5,11')).toBeInTheDocument();
      expect(within(nov).getByText('2026年4月')).toBeInTheDocument();
      // 保守会社のアカウントには保守会社の列を出さない
      expect(screen.queryByRole('columnheader', { name: '保守会社' })).toBeNull();

      // 開始日を入れると終了日も同じ日になる（B10）
      fireEvent.change(within(nov).getByLabelText('点検開始日'), { target: { value: '2026-11-10' } });
      expect(within(nov).getByLabelText('点検終了日')).toHaveValue('2026-11-10');
      fireEvent.change(within(nov).getByLabelText('メモ'), { target: { value: '点検月を11月に変更' } });
      fireEvent.click(screen.getByRole('button', { name: '↑ 申請する' }));
      await waitFor(() => expect(api.createBulkEntries).toHaveBeenCalledTimes(1));
      // 5月（開始日なし）は黙って飛ばす
      const sent = api.createBulkEntries.mock.calls[0]![0] as Record<string, unknown>[];
      expect(sent).toHaveLength(1);
      expect(sent[0]).toMatchObject({
        property_code: 'z0001A01',
        inspection_type: '消防設備点検',
        inspection_start: '2026-11-10',
        inspection_end: '2026-11-10',
        property_inspection_id: 'i1',
        vendor_id: 'v1',
        target_month: '2026-11-01',
        memo: '点検月を11月に変更',
        vendor_name: 'A社',
      });
    });

    it('時期の既定は点検一覧と同じ（申請済みの過去の月は出さず、「すべて」で出す。B13）', async () => {
      portalApi.fetchPortalEntries.mockResolvedValue([
        makeEntry({ property_code: 'z0001A01', inspection_type: '消防設備点検', target_month: '2026-05-01', inspection_start: '2026-05-10', status: 'ready' }),
      ]);
      renderPage();
      await waitFor(() => expect(screen.getAllByTestId('target-month').map((el) => el.textContent)).toEqual(['2026年11月']));
      fireEvent.change(screen.getByRole('combobox', { name: '時期' }), { target: { value: 'all' } });
      await waitFor(() => expect(screen.getAllByTestId('target-month').map((el) => el.textContent)).toContain('2026年5月'));
    });

    it('点検月未登録の行は申請すると入力が空に戻り、もう一度押しても二重に申請しない', async () => {
      portalApi.fetchPortalInspections.mockResolvedValue([
        makeInspection({
          property_code: 'z0001A01',
          property_name: '物件A',
          inspection_type_label: '消防設備点検',
          vendor_id: 'v1',
          inspection_months: [],
        }),
      ]);
      api.createBulkEntries.mockResolvedValue([]);
      renderPage();
      await waitFor(() => expect(screen.getAllByTestId('target-month')).toHaveLength(1));
      const row = () => rowOf('点検月未登録');
      fireEvent.change(within(row()).getByLabelText('点検開始日'), { target: { value: '2026-11-05' } });
      fireEvent.change(within(row()).getByLabelText('メモ'), { target: { value: 'メモ' } });
      // 読み直すと申請が予定に付く（点検月が無いので行は未申請のまま残る）
      portalApi.fetchPortalEntries.mockResolvedValue([
        makeEntry({ property_code: 'z0001A01', inspection_type: '消防設備点検', target_month: '2026-11-01', inspection_start: '2026-11-05' }),
      ]);
      fireEvent.click(screen.getByRole('button', { name: '↑ 申請する' }));
      await waitFor(() => expect(api.createBulkEntries).toHaveBeenCalledTimes(1));
      await waitFor(() => expect(portalApi.fetchPortalEntries.mock.calls.length).toBeGreaterThanOrEqual(2));
      await waitFor(() => expect(within(row()).getByLabelText('点検開始日')).toHaveValue(''));
      expect(within(row()).getByLabelText('メモ')).toHaveValue('');
      // 申請の対象が無くなるので申請ボタンは押せない
      expect(screen.getByRole('button', { name: '↑ 申請する' })).toBeDisabled();
      expect(api.createBulkEntries).toHaveBeenCalledTimes(1);
    });

    it('「全ての月」で点検月以外の月にも行を出し、その月を対象月として申請できる（超過にはしない。修正依頼1025 D5）', async () => {
      api.createBulkEntries.mockResolvedValue([]);
      renderPage();
      await waitFor(() => expect(screen.getAllByTestId('target-month')).toHaveLength(2));
      expect(screen.getByRole('combobox', { name: '表示する月' })).toHaveValue('inspection');
      fireEvent.change(screen.getByRole('combobox', { name: '表示する月' }), { target: { value: 'all' } });
      // 今月（10月）から今後3か月（既定の時期）: 10・11・12・1月。点検月以外の過去の月（6〜9月）は出さない
      await waitFor(() =>
        expect(screen.getAllByTestId('target-month').map((el) => el.textContent)).toEqual([
          '2026年5月',
          '2026年10月',
          '2026年11月',
          '2026年12月',
          '2027年1月',
        ]),
      );
      const dec = rowOf('2026年12月');
      expect(within(dec).getByText('未申請')).toBeInTheDocument();
      fireEvent.change(within(dec).getByLabelText('点検開始日'), { target: { value: '2026-12-03' } });
      fireEvent.click(screen.getByRole('button', { name: '↑ 申請する' }));
      await waitFor(() => expect(api.createBulkEntries).toHaveBeenCalledTimes(1));
      expect((api.createBulkEntries.mock.calls[0]![0] as Record<string, unknown>[])[0]).toMatchObject({
        property_inspection_id: 'i1',
        target_month: '2026-12-01',
        inspection_start: '2026-12-03',
      });
    });

    it('台が2台の点検は台ごとに行を出し、No を物件の下に出す。報告書UP・完了連絡は1台目の行だけ（修正依頼1025 H1〜H3）', async () => {
      portalApi.fetchPortalInspectionUnits.mockResolvedValue([
        { inspection_id: 'i1', unit_id: 'u1', unit_code: 'No1', unit_sort: 0, maintainer_id: 'v1', inspection_months: [], inspected_on: null, equipment_code: null },
        { inspection_id: 'i1', unit_id: 'u2', unit_code: 'No2', unit_sort: 1, maintainer_id: 'v1', inspection_months: [], inspected_on: null, equipment_code: null },
      ]);
      renderPage();
      await waitFor(() => expect(screen.getAllByTestId('target-month')).toHaveLength(4));
      const novRows = screen.getAllByTestId('target-month').filter((el) => el.textContent === '2026年11月').map((el) => el.closest('tr')!);
      expect(novRows.map((tr) => within(tr).getByTestId('unit-code').textContent)).toEqual(['No1', 'No2']);
      // ステータスは1台目と同じ
      expect(within(novRows[0]!).getByText('未申請')).toBeInTheDocument();
      expect(within(novRows[1]!).getByText('未申請')).toBeInTheDocument();
      // 1台目の行だけ報告書UP・完了連絡・日付の入力がある
      expect(within(novRows[0]!).getByRole('button', { name: '報告書UP' })).toBeInTheDocument();
      expect(within(novRows[1]!).queryByRole('button', { name: '報告書UP' })).toBeNull();
      expect(within(novRows[1]!).queryByRole('button', { name: '完了連絡' })).toBeNull();
      expect(within(novRows[1]!).queryByLabelText('点検開始日')).toBeNull();
      // 2台目の行は1台目の直後
      expect(novRows[1]!.previousElementSibling).toBe(novRows[0]);
    });

    it('申請不要・毎月の点検種別は毎月の行を出し、申請の欄を出さず、超過にしない（修正依頼1025 H4/G4）', async () => {
      portalApi.fetchInspectionTypeFlags.mockResolvedValue([{ inspection_type_id: 't1', report_only: true, monthly: true }]);
      renderPage();
      // 4月登録 → 4〜1月の毎月（既定の時期: 過去は超過だけなので出さず、今月から今後3か月）
      await waitFor(() =>
        expect(screen.getAllByTestId('target-month').map((el) => el.textContent)).toEqual([
          '2026年10月',
          '2026年11月',
          '2026年12月',
          '2027年1月',
        ]),
      );
      const oct = rowOf('2026年10月');
      expect(within(oct).getByTestId('inspection-months')).toHaveTextContent('毎月');
      expect(within(oct).getByText('申請不要')).toBeInTheDocument();
      expect(within(oct).queryByLabelText('点検開始日')).toBeNull();
      expect(within(oct).getByRole('button', { name: '報告書UP' })).toBeInTheDocument();
      expect(screen.queryByText('点検月超過')).toBeNull();
      // 過去の月（すべて）は報告書が無ければ「報告書未提出」
      fireEvent.change(screen.getByRole('combobox', { name: '時期' }), { target: { value: 'all' } });
      await waitFor(() => expect(within(rowOf('2026年5月')).getByText('報告書未提出')).toBeInTheDocument());
      expect(screen.queryByText('点検月超過')).toBeNull();
    });

    it('ステータス・No（対象月）の見出しで予定の行を並べ替え、管理会社は略称で出す（修正依頼1025 F3・F5）', async () => {
      portalApi.fetchManagementCompanyShortNames.mockResolvedValue([{ id: 'm1', name: 'テスト管理', short_name: 'ﾃｽﾄ管' }]);
      renderPage();
      await waitFor(() => expect(screen.getAllByTestId('target-month')).toHaveLength(2));
      const months = () => screen.getAllByTestId('target-month').map((el) => el.textContent);
      expect(months()).toEqual(['2026年5月', '2026年11月']);
      fireEvent.click(screen.getByLabelText(/^No（対象月）で並べ替え/));
      fireEvent.click(screen.getByLabelText(/^No（対象月）で並べ替え（昇順）/));
      expect(months()).toEqual(['2026年11月', '2026年5月']);
      // ステータス昇順: 超過（5月）が先
      fireEvent.click(screen.getByLabelText(/^ステータスで並べ替え/));
      expect(months()).toEqual(['2026年5月', '2026年11月']);
      await waitFor(() => expect(within(rowOf('2026年11月')).getByText('ﾃｽﾄ管')).toBeInTheDocument());
      expect(within(rowOf('2026年11月')).getByTitle('テスト管理')).toBeInTheDocument();
    });

    it('完了連絡は確認のうえ記録し、記録があれば点検完了と出す', async () => {
      formApi.markCompleted.mockResolvedValue({});
      renderPage();
      await waitFor(() => expect(screen.getAllByTestId('target-month')).toHaveLength(2));
      fireEvent.click(within(rowOf('2026年5月')).getByRole('button', { name: '完了連絡' }));
      expect(await screen.findByText(/点検の完了を連絡しますか？/)).toBeInTheDocument();
      formApi.fetchCompletions.mockResolvedValue([
        { id: 'c1', property_inspection_id: 'i1', target_month: '2026-05-01', vendor_id: 'v1', completed_at: '', completed_by: null },
      ]);
      fireEvent.click(screen.getByRole('button', { name: 'OK' }));
      await waitFor(() => expect(formApi.markCompleted).toHaveBeenCalledWith('i1', '2026-05-01'));
      await waitFor(() => expect(within(rowOf('2026年5月')).getByText('点検完了')).toBeInTheDocument());
      expect(within(rowOf('2026年5月')).getByRole('button', { name: '完了取消' })).toBeInTheDocument();
    });
  });

  it('leaving the page within the app keeps rows and the admin vendor; logging out drops them', async () => {
    const first = renderPage();
    fireEvent.change(await screen.findByLabelText('保守会社を選択'), { target: { value: 'v2' } });
    await waitFor(() => expect(useBulkStore.getState().masterData.properties).toHaveLength(3));
    await waitFor(() => expect(useBulkStore.getState().sessionLoaded).toBe(true));
    act(() => {
      useBulkStore.getState().addRow({ propertyCode: 'z0003A01' });
    });
    first.unmount();

    renderPage();
    expect(await screen.findByLabelText('保守会社を選択')).toHaveValue('v2');
    expect(useBulkStore.getState().rows).toHaveLength(1);
    expect(useBulkStore.getState().masterData.properties).toHaveLength(3);
    expect(api.fetchAllMasterData).toHaveBeenCalledTimes(1);

    act(() => useAuthStore.setState({ user: null, profile: null }));
    expect(useBulkStore.getState().rows).toHaveLength(0);
    expect(useBulkStore.getState().currentVendor).toEqual({ id: null, name: null });
  });
});
