import type { Area } from 'react-easy-crop';

/** poster-images バケットの上限（5MB）。lib/storage.ts の MAX_FILE_SIZE と同じ値（supabase クライアントを読み込まないよう持ち直す） */
const AD_MAX_BYTES = 5 * 1024 * 1024;

/** 広告画像の切り抜き比率（横:縦 = 2:1 固定。2026-10-24 ユーザー決定。ログイン画面の PC のセル ≒ 2:1 に合わせる） */
export const AD_CROP_ASPECT = 2;
/** 切り抜いた画像の書き出しサイズ（px） */
export const AD_CROP_WIDTH = 1920;
export const AD_CROP_HEIGHT = 960;
/** JPEG で書き出すときの品質 */
const AD_JPEG_QUALITY = 0.9;

export interface AdImageFormat {
  type: 'image/png' | 'image/jpeg';
  ext: 'png' | 'jpg';
}

/** 元が PNG なら PNG（透過・文字をそのまま）、それ以外は JPEG で書き出す */
export function adOutputFormat(sourceType: string): AdImageFormat {
  return sourceType === 'image/png' ? { type: 'image/png', ext: 'png' } : { type: 'image/jpeg', ext: 'jpg' };
}

/** 公開 URL から poster-images 内のパスを取り出す（貼紙画像の片付けと共通なので lib/posterPath に置く） */
export { storagePathFromPublicUrl } from '@/lib/posterPath';

/** 公開 URL の画像の形式を拡張子から推す（保存済みの画像を切り抜き直すときの書き出し形式に使う） */
export function sourceTypeFromUrl(url: string): string {
  const path = (url.split(/[?#]/)[0] ?? '').toLowerCase();
  return path.endsWith('.png') ? 'image/png' : 'image/jpeg';
}

/** 同じパスへ上書きしてもブラウザ・CDN の古い画像が出ないよう、URL に ?v=<更新時刻> を付ける（前の v は置き換える） */
export function withCacheBuster(url: string, version: number): string {
  const base = url.split(/[?#]/)[0] ?? '';
  return `${base}?v=${version}`;
}

/** 画像の読み込みや canvas の書き出しが CORS で止まったときの案内 */
export const AD_IMAGE_LOAD_ERROR =
  '画像を読み込めませんでした（画像の配信元が切り抜きを許可していない可能性があります）。元の画像ファイルを「画像を選ぶ」から選び直してください';

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    // 保存済みの画像（Storage の公開 URL）を canvas に読むため。blob: URL には影響しない
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(AD_IMAGE_LOAD_ERROR));
    img.src = src;
  });
}

function encodeCanvas(canvas: HTMLCanvasElement, format: AdImageFormat): Promise<Blob | null> {
  return new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, format.type, format.type === 'image/jpeg' ? AD_JPEG_QUALITY : undefined),
  );
}

function drawArea(img: HTMLImageElement, area: Area, whiteBackground: boolean): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = AD_CROP_WIDTH;
  canvas.height = AD_CROP_HEIGHT;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('画像の切り抜きに失敗しました（canvas を使えません）');
  if (whiteBackground) {
    // JPEG は透過を持てないので、透過の部分は白にする
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, AD_CROP_WIDTH, AD_CROP_HEIGHT);
  }
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(img, area.x, area.y, area.width, area.height, 0, 0, AD_CROP_WIDTH, AD_CROP_HEIGHT);
  return canvas;
}

/**
 * src の画像のうち area（元画像の px 座標。react-easy-crop の croppedAreaPixels）を
 * AD_CROP_WIDTH×AD_CROP_HEIGHT に描いて File にする。形式は adOutputFormat(sourceType)。
 * PNG が 5MB を超えた（写真の PNG など）ときは JPEG（品質0.9・透過は白）で書き出し直す。
 * それでも 5MB を超えた File はそのまま返し、保存前の確認（adImageFileError）で止める。
 */
export async function cropAdImage(src: string, area: Area, sourceType: string, slotIndex: number): Promise<File> {
  const img = await loadImage(src);
  let format = adOutputFormat(sourceType);
  let blob: Blob | null;
  try {
    blob = await encodeCanvas(drawArea(img, area, format.type === 'image/jpeg'), format);
    if (blob && format.type === 'image/png' && blob.size > AD_MAX_BYTES) {
      format = adOutputFormat('image/jpeg');
      blob = await encodeCanvas(drawArea(img, area, true), format);
    }
  } catch (err) {
    // CORS の許可なしで読んだ画像を描いた canvas は書き出せない（SecurityError）
    if (err instanceof DOMException && err.name === 'SecurityError') throw new Error(AD_IMAGE_LOAD_ERROR, { cause: err });
    throw err;
  }
  if (!blob) throw new Error('画像の切り抜きに失敗しました');
  return new File([blob], `slot_${slotIndex}.${format.ext}`, { type: format.type });
}
