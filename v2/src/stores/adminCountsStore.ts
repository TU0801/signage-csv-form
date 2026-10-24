import { create } from 'zustand';

/**
 * 管理画面サイドバーの件数。v1 は画面の配列の長さを数える（pendingEntries / pendingBuildingRequests / entries）。
 * v2 はサイドバーが開いたときに DB に件数を問い合わせ、各画面が一覧を読み込んだらその件数で上書きする。
 * v1: js/admin.js updateSidebarCounts
 */
interface AdminCountsState {
  /** 承認待ちのデータ（status=draft） */
  pendingEntries: number;
  /** ビル追加リクエスト（signage_building_vendors.status=pending） */
  buildingRequests: number;
  /** 新規建物の申請（signage_property_requests.status=pending。管理者だけ） */
  propertyRequests: number;
  /** データ一覧（承認済み）に今の絞り込みで出る件数 */
  approved: number;
  setPendingEntries: (n: number) => void;
  setBuildingRequests: (n: number) => void;
  setPropertyRequests: (n: number) => void;
  setApproved: (n: number) => void;
}

export const useAdminCountsStore = create<AdminCountsState>((set) => ({
  pendingEntries: 0,
  buildingRequests: 0,
  propertyRequests: 0,
  approved: 0,
  setPendingEntries: (n) => set({ pendingEntries: n }),
  setBuildingRequests: (n) => set({ buildingRequests: n }),
  setPropertyRequests: (n) => set({ propertyRequests: n }),
  setApproved: (n) => set({ approved: n }),
}));
