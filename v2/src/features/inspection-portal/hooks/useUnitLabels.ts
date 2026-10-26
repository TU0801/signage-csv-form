import { useEffect, useMemo, useRef, useState } from 'react';
import { fetchPortalInspectionUnits } from '@/lib/api/portal';
import { buildUnitIndex, unitLabelsById } from '../lib/units';

/**
 * 台 ID → No の表示（承認画面で台ごとの申請の台を出す。修正依頼1026 I7）。範囲は portal_inspection_units（管理者は全件・
 * 管理会社は自社物件）。unitIds は表示する申請の property_unit_id（null・空は無視）。台ごとの申請が無い間は読まない。
 * 読み込み済みのラベルに無い台が現れたら読み直す（後から加わった台の申請が「号機不明」のままにならないように。修正依頼1026 後続）。
 * 読んでも返らない台（範囲外・削除済み）で読み直し続けないよう、一度読みに行った台の組は2回読まない。読めなければ空（No を出さないだけ）
 */
export function useUnitLabels(unitIds: readonly (string | null | undefined)[]): ReadonlyMap<string, string> {
  const [labels, setLabels] = useState<ReadonlyMap<string, string>>(() => new Map());
  // 読みに行った台（返らなかった台も含む）
  const requested = useRef<Set<string>>(new Set());
  // 配列の作り直しで読み直さないよう、並べ替えた ID の並びで比べる
  const key = useMemo(
    () => [...new Set(unitIds.filter((id): id is string => !!id))].sort().join(','),
    [unitIds],
  );
  // 読み込みは途中で捨てない（台の組が変わっても、読みに行った台のラベルは足す）。捨てるのは画面を離れたときだけ
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  useEffect(() => {
    if (!key) return;
    const ids = key.split(',');
    if (ids.every((id) => labels.has(id) || requested.current.has(id))) return;
    ids.forEach((id) => requested.current.add(id));
    fetchPortalInspectionUnits()
      .then((rows) => {
        // 前に読んだラベルに足す（先に返った古い応答で新しいラベルを消さない）
        if (mounted.current) setLabels((prev) => new Map([...prev, ...unitLabelsById(buildUnitIndex(rows))]));
      })
      .catch((err: unknown) => console.error('号機の取得に失敗しました:', err));
  }, [key, labels]);
  return labels;
}
