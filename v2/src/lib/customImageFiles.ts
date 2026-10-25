import type { DbEntry } from '@/types/database';
import { customImageBaseName, extraPosterBaseName } from './csv';
import { parseExtraPosters } from './extraPosters';
import { safePosterUrl } from './posterUrl';

/** 申請の追加画像1枚（ZIP に入れるファイル）。baseName は CSV の点検案内TPLNo と同じ */
export interface CustomImageFile {
  url: string;
  baseName: string;
}

/**
 * 申請の追加画像（1枚目が追加の貼紙ならその画像、続けて2枚目以降の貼紙。修正依頼1025 D3）。
 * このプロジェクトの poster-images の URL だけ（safePosterUrl。値は保守会社が書けるので）
 */
export function customImageFiles(
  entry: Pick<DbEntry, 'poster_type' | 'poster_image' | 'property_code' | 'inspection_type' | 'id'> & { extra_posters?: unknown },
): CustomImageFile[] {
  const files: CustomImageFile[] = [];
  const main = entry.poster_type === 'custom' ? safePosterUrl(entry.poster_image) : null;
  if (main) files.push({ url: main, baseName: customImageBaseName(entry) });
  parseExtraPosters(entry.extra_posters).forEach((extra, i) => {
    const url = safePosterUrl(extra.image_url);
    if (url) files.push({ url, baseName: extraPosterBaseName(entry, i) });
  });
  return files;
}
