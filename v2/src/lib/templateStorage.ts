import { getPublicUrl } from './storage';

/**
 * テンプレート画像の固定表のファイル名 → Storage の公開 URL（poster-images/templates/）。
 * 1件入力のプレビューと点検種別モーダルのプレビューで共通に使う（features/single-entry/lib/templateImages.ts 参照）。
 */
export function templateFileUrl(fileName: string): string {
  return getPublicUrl(`templates/${fileName}`);
}
