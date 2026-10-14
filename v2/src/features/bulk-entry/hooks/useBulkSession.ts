import { useCallback, useEffect, useState } from 'react';
import { useAuthStore } from '@/stores/authStore';
import { useBulkStore, flushBulkAutoSave, resetBulkSession } from '@/stores/bulkStore';
import { useToast } from '@/components/ui/Toast';
import { fetchAllMasterData } from '@/lib/api/masterData';
import { getAssignedBuildings } from '@/lib/api/relationships';
import { fetchBulkSettings } from '@/lib/api/bulk-entry';
import { applySettings, DEFAULT_BULK_SETTINGS, flattenProperties, toBulkMasterData } from '../utils/bulkMaster';
import { clearAutoSave, readAutoSave } from '../utils/bulkAutoSave';
import type { BulkVendor } from '../types';

/**
 * 一括入力画面の読み込み・保守会社の切り替え・離脱時の扱い。
 * v1: js/bulk.js init（マスターデータと設定 → 保守会社 → 自動保存の復元）/ adminVendorSelect change / beforeunload
 * ready は読み込みが済むまで false（v1 は読み込み後に操作のイベントを登録し、失敗したら登録しない）。
 */
export function useBulkSession(confirm: (message: string) => Promise<boolean>) {
  const { addToast } = useToast();
  const profile = useAuthStore((s) => s.profile);
  const userId = useAuthStore((s) => s.user?.id ?? null);
  const isAdmin = profile?.role === 'admin';
  const [loadingDone, setLoadingDone] = useState(false);

  useEffect(() => {
    if (!profile || !userId) return;
    let cancelled = false;

    // 同じユーザーで読み込み済みなら（SPA 内で画面を離れて戻った）、行・保守会社・マスターをそのまま使う
    const current = useBulkStore.getState();
    if (current.sessionLoaded && current.userId === userId) {
      return () => flushBulkAutoSave();
    }

    resetBulkSession();
    const store = useBulkStore.getState();
    store.setUserId(userId);

    (async () => {
      try {
        const [data, settings] = await Promise.all([fetchAllMasterData(profile), fetchBulkSettings()]);
        if (cancelled) return;
        const master = toBulkMasterData(data);
        store.setMasterData(master);
        store.setAppSettings(applySettings(DEFAULT_BULK_SETTINGS, settings));
        // 一般ユーザーはプロファイルの保守会社に固定
        if (profile.role !== 'admin' && profile.vendor_id) {
          const vendor = master.vendors.find((v) => v.id === profile.vendor_id);
          store.setCurrentVendor({ id: profile.vendor_id, name: vendor?.vendorName || null });
        }
      } catch (error) {
        if (cancelled) return;
        console.error('Failed to load master data:', error);
        addToast('マスターデータの取得に失敗しました', 'error');
        return;
      }
      setLoadingDone(true);

      // v1: js/bulk-data.js restoreAutoSave
      const saved = readAutoSave(userId);
      if (saved) {
        const ok = await confirm(`${saved.rows.length}件の未保存データがあります。復元しますか？`);
        if (cancelled) return;
        if (ok) {
          useBulkStore.getState().restoreRows(saved.rows, saved.rowIdCounter);
          addToast(`${saved.rows.length}件のデータを復元しました`, 'success');
        } else {
          clearAutoSave(userId);
        }
      }
      // 復元の確認まで終えてから読み込み済みにする（確認の途中で離れたら、戻ったときに読み直して確認し直す）
      useBulkStore.getState().setSessionLoaded(true);
    })();

    return () => {
      cancelled = true;
      // SPA 内で画面を離れても状態は捨てない（ログアウト・別ユーザーは下の購読で捨てる）。書きかけの自動保存は先に書く
      flushBulkAutoSave();
      setLoadingDone(false);
    };
  }, [profile, userId, confirm, addToast]);

  // 保守会社の一覧はマスターの vendors（保守会社で物件を絞っても vendors は残る）
  const vendors: BulkVendor[] = useBulkStore((s) => s.masterData.vendors);
  const loadedForUser = useBulkStore((s) => s.sessionLoaded && s.userId === userId);
  const ready = loadingDone || loadedForUser;

  // ページ離脱の警告（別タブでのアカウント切替で開き直すときは出さない）。v1: js/bulk.js beforeunload
  useEffect(() => {
    const handler = (e: BeforeUnloadEvent) => {
      if (useAuthStore.getState().sessionChanged) return;
      flushBulkAutoSave();
      if (useBulkStore.getState().rows.length > 0) {
        e.preventDefault();
        e.returnValue = '';
      }
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, []);

  /**
   * 管理者の保守会社切り替え。選んだ会社の担当物件（端末の無い物件も1行で残す）に絞り、行は消す。
   * 未選択に戻したら全物件に戻す（行は残す）。
   * v1: js/bulk.js adminVendorSelect change
   */
  const changeVendor = useCallback(
    async (vendorId: string) => {
      const store = useBulkStore.getState();
      try {
        if (!vendorId) {
          const fresh = await fetchAllMasterData(profile);
          store.setMasterData(toBulkMasterData(fresh));
          store.setCurrentVendor({ id: null, name: null });
          return;
        }
        const selected = vendors.find((v) => v.id === vendorId);
        store.setCurrentVendor({ id: vendorId, name: selected?.vendorName || null });
        const buildings = await getAssignedBuildings({ role: 'user', vendor_id: vendorId });
        store.setMasterData({ ...useBulkStore.getState().masterData, properties: flattenProperties(buildings, true) });
        store.clearRows();
      } catch (error) {
        console.error('Failed to load vendor data:', error);
        addToast('保守会社データの取得に失敗しました', 'error');
      }
    },
    [profile, vendors, addToast],
  );

  return { ready, isAdmin, vendors, changeVendor };
}

// ログアウト・別ユーザーへの切り替えで前のユーザーの行を残さない（書きかけの自動保存は前のユーザーのキーに先に書く）。
// 画面を離れても状態を残すため、画面の外で見張る。v1 はログアウトでページを移るので状態が消える
useAuthStore.subscribe((auth) => {
  const bulkUserId = useBulkStore.getState().userId;
  if (bulkUserId && bulkUserId !== (auth.user?.id ?? null)) {
    flushBulkAutoSave();
    resetBulkSession();
  }
});
