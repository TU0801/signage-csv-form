/*
 * 1申請の2枚目以降の貼紙（signage_entries.extra_posters。修正依頼1025 D3）。
 * 最初の1枚は今までどおり poster_type / poster_image（テンプレートでも追加でもよい）。2枚目以降はすべて「追加」の貼紙で、
 * CSV では枚数分の行に展開し、追加画像 ZIP にも入れる（lib/csv.ts・lib/zipDownload.ts）。
 * supabase クライアントを読み込まない純関数だけ。
 */

/** 2枚目以降の貼紙1枚 */
export interface ExtraPoster {
  /** poster-images の公開 URL（アップロードした画像か、貼紙ライブラリの画像） */
  image_url: string;
  /** upload: 申請者がアップロードした画像 / library: 貼紙ライブラリから選んだ画像 */
  source: 'upload' | 'library';
  /** 貼紙ライブラリの行（source=library のとき） */
  library_id?: string | null;
  /** 表示位置（frame_No。'0'〜'4'）。空なら申請の貼紙表示位置と同じ */
  position?: string | null;
}

/** 1申請に持てる追加の貼紙の上限（DB の CHECK と同じ） */
export const MAX_EXTRA_POSTERS = 10;

/** DB の値（jsonb）を ExtraPoster の配列にする。形の合わない要素は捨てる（古い行・null は空配列） */
export function parseExtraPosters(value: unknown): ExtraPoster[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((v): ExtraPoster[] => {
    if (!v || typeof v !== 'object') return [];
    const o = v as Record<string, unknown>;
    if (typeof o.image_url !== 'string' || !o.image_url) return [];
    const source = o.source === 'library' ? 'library' : 'upload';
    const position = typeof o.position === 'string' && /^[0-4]$/.test(o.position) ? o.position : null;
    const libraryId = typeof o.library_id === 'string' && o.library_id ? o.library_id : null;
    return [
      {
        image_url: o.image_url,
        source,
        ...(libraryId ? { library_id: libraryId } : {}),
        ...(position ? { position } : {}),
      },
    ];
  });
}

/** 追加の貼紙の表示位置（無ければ申請の位置、それも無ければ ②） */
export function extraPosterPosition(extra: Pick<ExtraPoster, 'position'>, entryPosition: string | null | undefined): string {
  return extra.position || entryPosition || '2';
}
