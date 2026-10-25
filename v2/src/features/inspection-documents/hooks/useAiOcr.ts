import { useEffect, useState } from 'react';
import { fetchAiOcrStatus, fetchCorrectionDictionary, type AiOcrStatus } from '@/lib/api/property-files';
import { buildCorrectionDictionary, type CorrectionDictionary } from '../lib/aiOcr';

/**
 * AI-OCR が使えるか（キーが入っているか）と、自己改善の辞書。開いたときに1回だけ読む。
 * 確かめている間は使えない扱い（チェックボックスを無効のまま）にする
 */
export function useAiOcr() {
  const [status, setStatus] = useState<AiOcrStatus | null>(null);
  const [dictionary, setDictionary] = useState<CorrectionDictionary>(() => new Map());
  useEffect(() => {
    let cancelled = false;
    void fetchAiOcrStatus().then((s) => {
      if (!cancelled) setStatus(s);
    });
    fetchCorrectionDictionary()
      .then((rows) => {
        if (!cancelled) setDictionary(buildCorrectionDictionary(rows));
      })
      .catch((err: unknown) => console.warn('OCR dictionary load failed:', err));
    return () => {
      cancelled = true;
    };
  }, []);
  return { configured: status?.configured ?? false, checking: status === null, message: status?.message ?? null, dictionary };
}
