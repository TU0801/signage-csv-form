import { useEffect, useRef } from 'react';
import { useBulkStore } from '@/stores/bulkStore';

const AUTO_SAVE_INTERVAL = 30_000; // 30 seconds

/**
 * localStorage自動保存:
 * - 30秒間隔で自動保存
 * - ページ離脱時に保存
 * - マウント時にストレージから復元
 */
export function useBulkAutoSave() {
  const saveToStorage = useBulkStore((s) => s.saveToStorage);
  const loadFromStorage = useBulkStore((s) => s.loadFromStorage);
  const initialized = useRef(false);

  // Load from storage on mount
  useEffect(() => {
    if (!initialized.current) {
      loadFromStorage();
      initialized.current = true;
    }
  }, [loadFromStorage]);

  // Auto-save on interval
  useEffect(() => {
    const interval = setInterval(() => {
      saveToStorage();
    }, AUTO_SAVE_INTERVAL);

    return () => clearInterval(interval);
  }, [saveToStorage]);

  // Save on page unload
  useEffect(() => {
    const handleBeforeUnload = () => {
      saveToStorage();
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [saveToStorage]);
}
