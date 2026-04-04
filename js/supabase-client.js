/**
 * supabase-client.js - Re-export ファサード
 *
 * 全DB操作関数を機能別ファイル（js/supabase/）から re-export。
 * 既存の import { ... } from './supabase-client.js' を一切変更せずに動作する。
 *
 * 分割先:
 *   supabase/client.js        — Supabaseクライアント初期化
 *   supabase/auth.js          — 認証関連
 *   supabase/master-data.js   — マスターデータ取得
 *   supabase/relationships.js — 物件×ベンダー / ベンダー×点検種別紐付け
 *   supabase/entries.js       — 点検データCRUD
 *   supabase/admin-masters.js — マスターデータ管理（CRUD）
 *   supabase/users.js         — ユーザー管理
 *   supabase/approval.js      — 承認ワークフロー
 *   supabase/settings.js      — 設定管理
 *   supabase/storage.js       — 画像アップロード/削除
 *   supabase/ads.js           — 広告枠管理
 *   supabase/equipment.js     — 建物設備管理
 */

// クライアント
export { supabase } from './supabase/client.js';

// 認証
export { getUser, signIn, signOut, getProfile, isAdmin } from './supabase/auth.js';

// マスターデータ取得
export {
  getMasterProperties, getMasterVendors, getMasterInspectionTypes,
  getMasterCategories, getMasterTemplateImages,
  getAllMasterData, getAllMasterDataCamelCase
} from './supabase/master-data.js';

// 紐付け管理
export {
  getAssignedBuildings, getBuildingsByVendor, getBuildingVendors,
  getPendingBuildingRequests, addBuildingVendor,
  approveBuildingRequest, rejectBuildingRequest, removeBuildingVendor,
  getVendorInspections, addVendorInspection, removeVendorInspection
} from './supabase/relationships.js';

// 点検データ
export {
  getEntries, getUserEntriesCurrentMonth,
  createEntry, createEntries, updateEntry, deleteEntry,
  getAllEntries, updateEntriesStatusBulk
} from './supabase/entries.js';

// マスターデータ管理
export {
  addProperty, updateProperty, deleteProperty,
  addVendor, updateVendor, deleteVendor,
  addInspectionType, updateInspectionType, deleteInspectionType,
  addCategory, updateCategory, deleteCategory,
  addTemplateImage, updateTemplateImage, deleteTemplateImage
} from './supabase/admin-masters.js';

// ユーザー管理
export {
  getAllProfiles, updateProfileRole, updateUserProfile,
  updateUserStatus, createUser
} from './supabase/users.js';

// 承認ワークフロー
export {
  getPendingEntries, approveEntry, approveEntries,
  rejectEntry, submitEntry, submitEntries, revertToPending
} from './supabase/approval.js';

// 設定
export { getSettings, getSetting, updateSetting, updateSettings } from './supabase/settings.js';

// Storage
export {
  uploadPosterImage, deletePosterImage,
  uploadTemplateImageFile, deleteTemplateImageFile
} from './supabase/storage.js';

// 広告枠
export { getAdSlots, upsertAdSlot, uploadAdImage, deleteAdImage } from './supabase/ads.js';

// 建物設備
export { getBuildingEquipment, addBuildingEquipment, deleteBuildingEquipment } from './supabase/equipment.js';
