import { useEffect, useMemo, useState } from 'react';
import { fetchPropertyFileTargets } from '@/lib/api/property-files';
import type { PropertyCandidate } from '../lib/aiOcr';

/**
 * その他ファイルの建物の選択肢。DB の「置ける建物」（portal_property_file_targets）と、呼び出し側が持つ候補（点検の物件）を
 * 合わせる。点検行の無い自社物件（管理会社）も選べるようにするため。読めなかったときは呼び出し側の候補だけ
 */
export function usePropertyFileTargets(fallback: PropertyCandidate[]): PropertyCandidate[] {
  const [targets, setTargets] = useState<PropertyCandidate[]>([]);
  useEffect(() => {
    let cancelled = false;
    fetchPropertyFileTargets()
      .then((rows) => {
        if (!cancelled) setTargets(rows);
      })
      .catch((err: unknown) => console.warn('property file targets load failed:', err));
    return () => {
      cancelled = true;
    };
  }, []);
  return useMemo(() => {
    const m = new Map<string, string>();
    for (const p of [...targets, ...fallback]) if (!m.has(p.code)) m.set(p.code, p.name);
    return [...m.entries()]
      .map(([code, name]) => ({ code, name }))
      .sort((a, b) => a.name.localeCompare(b.name, 'ja') || a.code.localeCompare(b.code));
  }, [targets, fallback]);
}
