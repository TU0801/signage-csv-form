import { useEffect, useRef } from 'react';

/**
 * 別のタブから戻ってきたとき（visibilitychange で visible）に一覧を読み直す。
 * 開いている間に届いた申請に気づけるようにするため。モーダルや確認を開いている間・読み込み中は読み直さない
 * （操作中の画面の裏で一覧が入れ替わらないように）。
 */
export function useRefetchOnVisible(refetch: () => unknown, enabled: boolean): void {
  const latest = useRef({ refetch, enabled });
  useEffect(() => {
    latest.current = { refetch, enabled };
  });

  useEffect(() => {
    const onChange = () => {
      if (document.visibilityState !== 'visible') return;
      if (!latest.current.enabled) return;
      void latest.current.refetch();
    };
    document.addEventListener('visibilitychange', onChange);
    return () => document.removeEventListener('visibilitychange', onChange);
  }, []);
}
