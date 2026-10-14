import { useEffect, useMemo, useState, useCallback } from 'react';
import { useMasterData } from '@/hooks/useMasterData';
import { fetchDisplayTimeDefault, fetchProfileEmails } from '@/lib/api/admin-entries';
import { resolveDisplayDefault } from '../lib/entries';

/**
 * 一覧・承認待ち・詳細・編集で共通に引く表示用の値（物件名・登録者メール・表示時間の既定）
 */
export function useEntryLookups() {
  const { properties, vendors } = useMasterData();
  const [emails, setEmails] = useState<Map<string, string>>(new Map());
  const [displayTimeDefault, setDisplayTimeDefault] = useState<string | undefined>(undefined);

  useEffect(() => {
    let cancelled = false;
    fetchProfileEmails()
      .then((m) => {
        if (!cancelled) setEmails(m);
      })
      .catch((err) => console.error('Failed to load profiles:', err));
    fetchDisplayTimeDefault().then((v) => {
      if (!cancelled) setDisplayTimeDefault(v);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const propertyNames = useMemo(() => {
    const map = new Map<string, string>();
    for (const p of properties) map.set(p.property_code, p.property_name);
    return map;
  }, [properties]);

  // v1: js/admin.js getUserEmail
  const emailOf = useCallback(
    (userId: string | null | undefined) => (userId ? emails.get(userId) || '-' : '-'),
    [emails],
  );

  return {
    properties,
    vendors,
    propertyNames,
    emailOf,
    displayTimeDefault,
    displayDefault: resolveDisplayDefault(displayTimeDefault),
  };
}

export type EntryLookups = ReturnType<typeof useEntryLookups>;
