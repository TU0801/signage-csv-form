import { create } from 'zustand';

/**
 * 点検登録フォーム（1件入力・一括入力）で共有する状態。1件入力と一括入力を切り替えても管理会社の絞り込みを残す。
 * '' = 全て、MANAGEMENT_COMPANY_NONE = 未設定、それ以外は管理会社 ID
 */
interface InspectionFormState {
  managementCompanyId: string;
  setManagementCompanyId: (id: string) => void;
}

export const useInspectionFormStore = create<InspectionFormState>((set) => ({
  managementCompanyId: '',
  setManagementCompanyId: (id) => set({ managementCompanyId: id }),
}));
