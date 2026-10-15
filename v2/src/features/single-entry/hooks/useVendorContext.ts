import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { fetchActivePropertyCodes } from '@/lib/api/relationships';
import { fetchLinkedInspectionIds } from '@/lib/api/single-entry';
import type { MasterProperty } from '@/types/app';
import type { DbVendor } from '@/types/database';

const EMPTY_IDS: ReadonlySet<string> = new Set<string>();

interface Loaded {
  vendorId: string;
  linkedIds: ReadonlySet<string>;
  /** 管理者が選んだ保守会社の担当物件（一般ユーザーは useMasterData が担当物件だけを返すので null） */
  propertyCodes: Set<string> | null;
}

interface UseVendorContextArgs {
  isAdmin: boolean;
  profileVendorId: string | null;
  properties: MasterProperty[];
  vendors: DbVendor[];
  /** 紐付けを読み終えたとき（カテゴリ・点検種別の初期選択に使う） */
  onLinkedLoaded: (linkedIds: ReadonlySet<string>) => void;
}

/**
 * 紐付けを読む保守会社は、一般ユーザーは自社（profile.vendor_id）、管理者は画面で選んだ保守会社。
 * 保守会社が決まったら、その紐付け点検種別（と管理者なら担当物件）を読む。記録する保守会社（vendor）は下の v1 準拠の決め方。
 * 選択を速く切り替えても最後の選択の結果だけを反映する（v1 adminVendorChangeSeq の last-wins）。
 */
// v1: js/script.js onAdminVendorChange / init（window.currentVendorId の紐付け反映）
export function useVendorContext({
  isAdmin,
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

  // 記録・プレビューに使う保守会社は v1 と同じ決め方にする（ユーザー決定 2026-10-15）:
  // 管理者がヘッダーで選んだときはその会社、それ以外（一般ユーザー・未選択の管理者）は社名順の先頭の会社。
  // v1 は隠し項目 #vendor が '0' 固定で masterData.vendors[0] を使う（index.html:363, script.js:304-309, 952）。
  // 一般ユーザーでも自社ではなく先頭の会社名・緊急連絡先が入る点は承知のうえでの決定。紐付けの読み込みは自社（vendorId）のまま
  const vendor = useMemo(() => {
    if (isAdmin && adminVendorId) return vendors.find((v) => String(v.id) === String(adminVendorId)) ?? null;
    return vendors[0] ?? null;
  }, [vendors, isAdmin, adminVendorId]);

  const selectAdminVendor = useCallback((id: string) => setAdminVendorId(id), []);

  return {
    adminVendorId,
    selectAdminVendor,
    vendor,
    visibleProperties,
    linkedIds: current?.linkedIds ?? EMPTY_IDS,
  };
}
