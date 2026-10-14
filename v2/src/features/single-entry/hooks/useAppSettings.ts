import { useEffect, useState } from 'react';
import { fetchAppSettings, type AppSettings } from '@/lib/api/single-entry';

/** 入力画面の設定値（読めなければ既定値）。読み終わるまで null */
// v1: index.html initAuth（getSettings → window.appSettings）
export function useAppSettings(): AppSettings | null {
  const [settings, setSettings] = useState<AppSettings | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetchAppSettings().then((s) => {
      if (!cancelled) setSettings(s);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  return settings;
}
