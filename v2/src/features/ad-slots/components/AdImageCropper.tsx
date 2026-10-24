import { useState } from 'react';
import Cropper, { type Area, type Point } from 'react-easy-crop';
import { Button } from '@/components/ui/Button';
import { AD_CROP_ASPECT, AD_CROP_HEIGHT, AD_CROP_WIDTH, AD_IMAGE_LOAD_ERROR, cropAdImage } from '../lib/adImage';

interface AdImageCropperProps {
  /** 切り抜く画像（選んだファイルの blob: URL か、保存済みの画像の公開 URL） */
  src: string;
  /** 元の画像の形式（PNG なら PNG で書き出す） */
  sourceType: string;
  slotIndex: number;
  onCancel: () => void;
  onCropped: (file: File) => void;
}

const MIN_ZOOM = 1;
const MAX_ZOOM = 5;

/** 広告画像を横:縦 = 2:1 で切り抜く（ドラッグで位置、ホイール・スライダーで拡大）。確定すると 1920×960 の File を返す */
export function AdImageCropper({ src, sourceType, slotIndex, onCancel, onCropped }: AdImageCropperProps) {
  const [crop, setCrop] = useState<Point>({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [area, setArea] = useState<Area | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // 画像そのものを読めない（CORS など）ときは切り抜けないので確定を止める
  const [loadFailed, setLoadFailed] = useState(false);

  const handleConfirm = async () => {
    if (!area) return;
    setBusy(true);
    setError(null);
    try {
      onCropped(await cropAdImage(src, area, sourceType, slotIndex));
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-2 rounded-md border border-blue-200 bg-blue-50/50 p-2" data-testid="ad-image-cropper">
      <p className="text-sm font-medium text-blue-800">画像の切り抜き（横:縦 = 2:1）</p>
      <div className="relative h-56 overflow-hidden rounded bg-slate-800">
        <Cropper
          image={src}
          crop={crop}
          zoom={zoom}
          minZoom={MIN_ZOOM}
          maxZoom={MAX_ZOOM}
          aspect={AD_CROP_ASPECT}
          onCropChange={setCrop}
          onZoomChange={setZoom}
          onCropComplete={(_, pixels) => setArea(pixels)}
          // 保存済みの画像を canvas に読むため CORS で読む（読めなければ案内を出す）
          mediaProps={{ crossOrigin: 'anonymous', onError: () => setLoadFailed(true) }}
        />
      </div>
      <div className="flex items-center gap-2">
        <label htmlFor="adCropZoom" className="shrink-0 text-xs text-gray-700">
          拡大
        </label>
        <input
          id="adCropZoom"
          type="range"
          min={MIN_ZOOM}
          max={MAX_ZOOM}
          step={0.01}
          value={zoom}
          onChange={(e) => setZoom(Number(e.target.value))}
          className="w-full"
        />
        <span className="w-10 shrink-0 text-right text-xs tabular-nums text-gray-600">{zoom.toFixed(1)}倍</span>
      </div>
      <p className="text-xs text-gray-500">
        ドラッグで位置を、ホイールかスライダーで拡大を変えます。枠の中が {AD_CROP_WIDTH}×{AD_CROP_HEIGHT} の画像になります
        （元が PNG なら PNG、それ以外は JPG）。
      </p>
      {(loadFailed || error) && (
        <p role="alert" className="text-xs text-red-600">
          {loadFailed ? AD_IMAGE_LOAD_ERROR : error}
        </p>
      )}
      <div className="flex justify-end gap-2">
        <Button type="button" variant="secondary" size="sm" onClick={onCancel} disabled={busy}>
          切り抜きをやめる
        </Button>
        <Button type="button" size="sm" onClick={handleConfirm} disabled={busy || !area || loadFailed}>
          {busy ? '切り抜き中...' : 'この範囲で切り抜く'}
        </Button>
      </div>
    </div>
  );
}
