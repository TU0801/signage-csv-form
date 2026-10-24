/*
 * poster-images の公開 URL とバケット内のパスの扱い（supabase クライアントを読み込まない純関数だけ）。
 * 使われなくなった貼紙画像の片付け（修正依頼1024 後続 orphan）と広告枠の画像で共通に使う。
 */

/** 公開 URL の中で poster-images バケットのパスが始まる目印 */
const BUCKET_MARKER = '/poster-images/';

/** 公開 URL から poster-images 内のパス（例 ads/slot_1.png）を取り出す。クエリ（?v=…）は外す。当てはまらなければ null */
export function storagePathFromPublicUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  const withoutQuery = url.split(/[?#]/)[0] ?? '';
  const at = withoutQuery.indexOf(BUCKET_MARKER);
  if (at < 0) return null;
  let path: string;
  try {
    path = decodeURIComponent(withoutQuery.slice(at + BUCKET_MARKER.length));
  } catch {
    return null;
  }
  return path || null;
}

/**
 * 自分がアップロードした貼紙画像（{userId}/{ファイル名}）のパスだけ返す。テンプレート（templates/）・広告（ads/）・
 * 他の人のフォルダ・.. を含む名前は null（片付けで消してよいのは自分の画像だけ）
 */
export function ownPosterPath(url: string | null | undefined, userId: string | null | undefined): string | null {
  if (!userId) return null;
  const path = storagePathFromPublicUrl(url);
  if (!path || path.includes('..')) return null;
  const [folder, ...rest] = path.split('/');
  return folder === userId && rest.length === 1 && rest[0] ? path : null;
}

/** 候補の URL から、空・重複と、まだ持たれている（画面の行・コピー中の行・保存したテンプレートにある）URL を除く */
export function notHeld(candidates: Iterable<string | null | undefined>, held: Iterable<string | null | undefined>): string[] {
  const heldSet = new Set<string>();
  for (const h of held) if (h) heldSet.add(h);
  const out = new Set<string>();
  for (const c of candidates) if (c && !heldSet.has(c)) out.add(c);
  return [...out];
}

/**
 * 詳細設定を閉じたときに片付ける画像。開いている間にアップロードした画像と、開いたときの画像のうち、
 * 閉じたあと行に残る画像（kept）以外。保存なら kept＝保存した画像（テンプレートに戻したなら ''）、
 * キャンセル（× ・Escape を含む）なら kept＝開いたときの画像（＝アップロードした分だけ消える）
 */
export function rowDetailDiscards(opts: { original: string; uploaded: readonly string[]; kept: string }): string[] {
  return notHeld([...opts.uploaded, opts.original], [opts.kept]);
}
