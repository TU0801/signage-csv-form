import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { fetchActivePropertyCodes } from '@/lib/api/relationships';
import { fetchLinkedInspectionIds } from '@/lib/api/single-entry';
import { matchedRowVendor } from '@/features/bulk-entry/utils/rowVendor';
import type { InspectionLinkRow } from '@/features/inspection-portal/lib/inspectionLink';
import type { MasterProperty } from '@/types/app';
import type { DbVendor } from '@/types/database';

const EMPTY_IDS: ReadonlySet<string> = new Set<string>();
const NO_INSPECTIONS: readonly InspectionLinkRow[] = [];

interface Loaded {
  vendorId: string;
  linkedIds: ReadonlySet<string>;
  /** 管理者が選んだ保守会社の担当物件（一般ユーザーは useMasterData が担当物件だけを返すので null） */
  propertyCodes: Set<string> | null;
}

/** 管理会社の受注先を決める入力（物件・点検工事案内の名前・点検開始日） */
export interface VendorSelection {
  propertyCode: string;
  inspectionType: string;
  startDate: string;
}

/** 記録する保守会社と、点検行に結び付ける保守会社。決まらなければ vendor は null で reason に理由（管理会社だけ） */
export interface ResolvedVendor {
  vendor: DbVendor | null;
  linkVendorId: string | null;
  reason: string | null;
}

interface UseVendorContextArgs {
  isAdmin: boolean;
  /** 管理会社のアカウント（修正依頼1115 (2)）。物件は自社物件全部、受注先は選んだ物件・点検種別の点検行の保守会社 */
  isManagement?: boolean;
  /** 管理会社の受注先を決める点検行（portal_inspections。自社物件の点検） */
  inspections?: readonly InspectionLinkRow[];
  profileVendorId: string | null;
  properties: MasterProperty[];
  vendors: DbVendor[];
  /** 紐付けを読み終えたとき（カテゴリ・点検種別の初期選択に使う） */
  onLinkedLoaded: (linkedIds: ReadonlySet<string>) => void;
}

/**
 * 紐付けを読む保守会社は、一般ユーザーは自社（profile.vendor_id）、管理者は画面で選んだ保守会社。管理会社は保守会社を持たず
 * （紐付けは読まない。物件は自社物件全部）、受注先は resolveVendor で入力ごとに点検行から決める（修正依頼1115 (2)）。
 * 保守会社が決まったら、その紐付け点検種別（と管理者なら担当物件）を読む。記録する保守会社（vendor）も同じ会社。
 * 選択を速く切り替えても最後の選択の結果だけを反映する（v1 adminVendorChangeSeq の last-wins）。
 */
// v1: js/script.js onAdminVendorChange / init（window.currentVendorId の紐付け反映）
export function useVendorContext({
  isAdmin,
  isManagement = false,
  inspections = NO_INSPECTIONS,
  profileVendorId,
  properties,
  vendors,
  onLinkedLoaded,
}: UseVendorContextArgs) {
  const [adminVendorId, setAdminVendorId] = useState('');
  const [loaded, setLoaded] = useState<Loaded | null>(null);

  const onLinkedLoadedRef = useRef(onLinkedLoaded);
  useEffect(() => {
    onLinkedLoadedRef.current = onLinkedLoaded;
  }, [onLinkedLoaded]);

  // 管理者は profile.vendor_id を見ない。v1 は index.html initAuth で管理者にも currentVendorId = profile.vendor_id を
  // 入れて init で紐付けを反映するが、同じ行のコメントが「管理者は null」としており意図と食い違うため移植しない（v1 の不具合候補）
  const vendorId = isAdmin ? adminVendorId || null : profileVendorId;

  useEffect(() => {
    if (!vendorId) return;
    let cancelled = false;
    (async () => {
      const [linkedIds, propertyCodes] = await Promise.all([
        fetchLinkedInspectionIds(vendorId),
        isAdmin
          ? fetchActivePropertyCodes(vendorId).catch((e: unknown) => {
              console.error('保守会社の担当物件の取得に失敗しました:', e);
              return [] as string[];
            })
          : Promise.resolve(null),
      ]);
      if (cancelled) return; // 後の選択に追い越された
      setLoaded({ vendorId, linkedIds, propertyCodes: propertyCodes ? new Set(propertyCodes) : null });
      onLinkedLoadedRef.current(linkedIds);
    })();
    return () => {
      cancelled = true;
    };
  }, [vendorId, isAdmin]);

  const current = vendorId && loaded?.vendorId === vendorId ? loaded : null;

  const visibleProperties = useMemo(() => {
    if (!isAdmin || !adminVendorId) return properties;
    // 担当物件を読み終えるまでは出さない（別の保守会社の物件を選べないように）
    if (!current?.propertyCodes) return [];
    const codes = current.propertyCodes;
    return properties.filter((p) => codes.has(p.property_code));
  }, [isAdmin, adminVendorId, properties, current]);

  // 記録・プレビューに使う保守会社（申請の vendor_name・emergency_contact。CSV の受注先名・緊急連絡先にも出る）は、
  // 保守会社のアカウントは自社（profile.vendor_id）、管理者はヘッダーで選んだ会社（未選択なら無し＝データを追加で止める）。
  // 点検予定に結び付いた申請は、申請のときに結び付いた点検の保守会社で記録し直す（SingleEntryPage handleSubmit）。
  // ユーザー決定（2026-10-25）で 10/15 の v1 準拠（隠し項目 #vendor = '0' の masterData.vendors[0]＝社名順の先頭。
  // index.html:363, script.js:304-309, 952）をやめた。v1 とはここが意図して違う
  const vendor = useMemo(() => {
    if (!vendorId) return null;
    return vendors.find((v) => String(v.id) === String(vendorId)) ?? null;
  }, [vendors, vendorId]);

  const selectAdminVendor = useCallback((id: string) => setAdminVendorId(id), []);

  // 管理会社（修正依頼1115 (2)）: 全社の点検を扱うので「画面上部の1社」は無い。受注先（vendor_name＝CSV 4列目・vendor_id）は
  // 選んだ物件＋点検工事案内＋点検開始日の月で当たる点検行の保守会社（一括入力の手で足した行と同じ matchedRowVendor。
  // DB の guard_entry_portal_columns も同じ会社に決める）。当たらない・保守会社未登録・複数社なら決めずに理由を返す（追加で止める）
  const managementVendors = useMemo(
    () => vendors.map((v) => ({ id: String(v.id), vendorName: v.vendor_name, emergencyContact: v.emergency_contact || '' })),
    [vendors],
  );
  const resolveVendor = useCallback(
    (sel: VendorSelection): ResolvedVendor => {
      if (!isManagement) return { vendor, linkVendorId: vendorId, reason: null };
      if (!sel.inspectionType) return { vendor: null, linkVendorId: null, reason: '点検工事案内を選択してください' };
      const row = matchedRowVendor(sel, inspections, managementVendors);
      const found = row.id && !row.reason ? (vendors.find((v) => String(v.id) === row.id) ?? null) : null;
      return { vendor: found, linkVendorId: found ? row.id : null, reason: found ? null : (row.reason ?? null) };
    },
    [isManagement, vendor, vendorId, inspections, managementVendors, vendors],
  );

  return {
    adminVendorId,
    selectAdminVendor,
    vendor,
    /** 点検行に結び付ける保守会社（一般ユーザーは自社、管理者は選んだ会社。未選択は null）。vendor（記録する会社）の id と同じ */
    linkVendorId: vendorId,
    /** 物件・点検種別ごとの保守会社（管理会社は点検行から決める。管理者・保守会社は vendor・linkVendorId のまま） */
    resolveVendor,
    visibleProperties,
    linkedIds: current?.linkedIds ?? EMPTY_IDS,
  };
}
