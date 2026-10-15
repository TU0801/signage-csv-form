import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { useState, type ReactNode } from 'react';
import { render, screen, fireEvent, waitFor, act, cleanup } from '@testing-library/react';
import { ToastProvider } from '@/components/ui/Toast';
import { HeaderSlotContext } from '@/components/layout/HeaderSlot';
import { useAuthStore } from '@/stores/authStore';
import { useBulkStore, resetBulkSession } from '@/stores/bulkStore';
import { BulkEntryPage } from '@/pages/BulkEntryPage';
import type { MasterData } from '@/types/app';
import type { DbProfile, DbProperty } from '@/types/database';
import { createMemoryStorage } from './memoryStorage';

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

  it('submitting with error rows asks first, sends only valid rows and keeps the error rows', async () => {
    api.createBulkEntries.mockResolvedValue([]);
    renderPage();
    fireEvent.change(await screen.findByLabelText('保守会社を選択'), { target: { value: 'v2' } });
    await waitFor(() => expect(useBulkStore.getState().masterData.properties).toHaveLength(3));
    await waitFor(() => expect(useBulkStore.getState().sessionLoaded).toBe(true));
    act(() => {
      useBulkStore.getState().addRow({ propertyCode: 'z0003A01', inspectionType: '消防設備点検' });
      // 端末の無い物件は端末エラーのまま（申請できるかは未決）
      useBulkStore.getState().addRow({ propertyCode: 'z0004A01', inspectionType: '消防設備点検' });
    });
    expect(screen.getByText('端末未設置')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: '↑ 申請する' }));
    expect(await screen.findByText(/エラーの1件は申請せず、表に残します/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'OK' }));

    await waitFor(() => expect(useBulkStore.getState().rows).toHaveLength(1));
    expect(api.createBulkEntries.mock.calls[0]![0]).toHaveLength(1);
    expect(useBulkStore.getState().rows[0]!.propertyCode).toBe('z0004A01');
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
