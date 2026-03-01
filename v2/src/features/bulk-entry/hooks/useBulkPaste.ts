import { useCallback, useEffect, useState } from 'react';
import { parseExcelPaste } from '../utils/parseExcelPaste';
import { useBulkStore } from '@/stores/bulkStore';

/**
 * TSVペースト処理フック
 * - Ctrl+V / Cmd+V でテーブル外でのペーストを検知
 * - モーダルで確認後にインポート
 */
export function useBulkPaste() {
  const [pasteText, setPasteText] = useState('');
  const [showPasteModal, setShowPasteModal] = useState(false);
  const importRows = useBulkStore((s) => s.importRows);

  const handlePasteEvent = useCallback((e: ClipboardEvent) => {
    // Only intercept if not focused on an input/textarea
    const target = e.target as HTMLElement;
    const tagName = target.tagName.toLowerCase();
    if (tagName === 'input' || tagName === 'textarea' || tagName === 'select') {
      return;
    }

    const text = e.clipboardData?.getData('text/plain') ?? '';
    if (!text.trim()) return;

    // Check if it looks like TSV (contains tabs)
    if (text.includes('\t')) {
      e.preventDefault();
      setPasteText(text);
      setShowPasteModal(true);
    }
  }, []);

  useEffect(() => {
    document.addEventListener('paste', handlePasteEvent);
    return () => document.removeEventListener('paste', handlePasteEvent);
  }, [handlePasteEvent]);

  const confirmPaste = useCallback(
    (text: string) => {
      const parsed = parseExcelPaste(text);
      if (parsed.length > 0) {
        importRows(parsed);
      }
      setShowPasteModal(false);
      setPasteText('');
      return parsed.length;
    },
    [importRows],
  );

  const cancelPaste = useCallback(() => {
    setShowPasteModal(false);
    setPasteText('');
  }, []);

  return {
    pasteText,
    showPasteModal,
    setPasteText,
    setShowPasteModal,
    confirmPaste,
    cancelPaste,
  };
}
