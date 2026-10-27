import { useCallback, useEffect, useRef, useState } from 'react';
import { useToast } from '@/components/ui/Toast';
import { preparePosterImage } from '@/lib/pdfToPng';
import { uploadPosterImage } from '@/lib/storage';
import { notHeld } from '@/lib/posterPath';

interface PosterUploadsOptions {
  userId: string | null;
  /** 開いたときにフォームが持っていた画像（キャンセルなら残し、保存で外れたら片付けの候補にする） */
  originals: readonly string[];
  /** 片付け（一括入力は画面の行・テンプレートがまだ持つ画像を除いてから消す。申請の編集は自分の未参照の画像だけ消す） */
  discard: (urls: string[]) => void;
}

/**
 * 基本フォーム（詳細設定）で選んだ貼紙画像のアップロードと片付け。選んだ時点で poster-images にアップロードして URL を持ち、
 * フォームが外れたとき（保存・キャンセル・×・Escape）に、残らない画像を1回だけ片付ける。
 * keep に保存で残す画像を渡す（渡さずに外れたらキャンセル＝開いたときの画像が残り、アップロードした分だけ消える）
 */
export function usePosterUploads({ userId, originals, discard }: PosterUploadsOptions) {
  const { addToast } = useToast();
  const [uploading, setUploading] = useState(false);
  const uploadedRef = useRef<string[]>([]);
  const keptRef = useRef<string[] | null>(null);
  const closedRef = useRef(false);
  const discardRef = useRef(discard);
  discardRef.current = discard;
  const originalsKey = originals.filter(Boolean).join('\n');

  useEffect(() => {
    closedRef.current = false;
    const opened = originalsKey ? originalsKey.split('\n') : [];
    return () => {
      closedRef.current = true;
      const discards = notHeld([...uploadedRef.current, ...opened], keptRef.current ?? opened);
      uploadedRef.current = [];
      keptRef.current = null;
      discardRef.current(discards);
    };
  }, [originalsKey]);

  // PDF は1ページ目を PNG にする。アップロードできたら URL を返す（閉じられた・失敗したら null）
  const uploadFile = useCallback(
    async (file: File): Promise<string | null> => {
      setUploading(true);
      try {
        const prepared = await preparePosterImage(file);
        if (!userId) throw new Error('ログイン情報を確認できません。画面を読み込み直してください');
        const url = await uploadPosterImage(prepared.file, userId);
        // アップロード中に閉じられたら、どこにも入らないのでその場で片付ける
        if (closedRef.current) {
          discardRef.current([url]);
          return null;
        }
        uploadedRef.current.push(url);
        if (prepared.notice) addToast(prepared.notice, 'info');
        return url;
      } catch (err) {
        addToast(err instanceof Error ? err.message : '画像を選択できませんでした', 'error');
        return null;
      } finally {
        setUploading(false);
      }
    },
    [userId, addToast],
  );

  const keep = useCallback((urls: readonly string[]) => {
    keptRef.current = urls.filter(Boolean);
  }, []);

  return { uploading, uploadFile, keep };
}
