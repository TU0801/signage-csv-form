import { useCallback, useEffect, useRef, useState } from 'react';
import { computePosterSize } from '../lib/entryLogic';
import './posterPreview.css';

interface PosterPreviewProps {
  /** テンプレート画像の URL（解決できなければ null） */
  templateImageUrl: string | null;
  templateNo: string;
  /** 追加（カスタム）貼紙のとき true */
  isCustom: boolean;
  customImageUrl: string | null;
  noticeText: string;
  dateText: string;
  remarks: string;
  vendorName: string;
  emergencyContact: string;
}

const placeholderClass = 'flex h-48 items-center justify-center rounded-md bg-slate-50 text-xs text-gray-500';

/**
 * 張紙プレビュー。テンプレート画像に案内文・日付・備考・保守会社・電話番号を重ねる。
 * 枠を画像の縦横比に合わせ（幅は親の幅、高さは画面の 60% まで）、文字の大きさを枠の幅から決める。
 */
// v1: js/script.js updatePreview / updateCustomImagePreview
export function PosterPreview({
  templateImageUrl,
  templateNo,
  isCustom,
  customImageUrl,
  noticeText,
  dateText,
  remarks,
  vendorName,
  emergencyContact,
}: PosterPreviewProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const imgRef = useRef<HTMLImageElement>(null);
  const [size, setSize] = useState<{ url: string; width: number; height: number } | null>(null);

  // v1: updatePreview の fitContainer
  const fit = useCallback(() => {
    const img = imgRef.current;
    const parent = containerRef.current?.parentElement;
    if (!img || !parent) return;
    const s = computePosterSize(img.naturalWidth, img.naturalHeight, parent.clientWidth, window.innerHeight * 0.6);
    if (s) setSize({ url: img.getAttribute('src') ?? '', ...s });
  }, []);

  useEffect(() => {
    window.addEventListener('resize', fit);
    return () => window.removeEventListener('resize', fit);
  }, [fit]);

  if (isCustom) {
    if (!customImageUrl) return <div className={placeholderClass}>画像を選択してください</div>;
    return (
      <div className="se-poster-preview">
        <img src={customImageUrl} alt="カスタム貼紙" style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
      </div>
    );
  }

  if (!templateImageUrl) return <div className={placeholderClass}>点検工事案内を選択</div>;

  const fitted = size && size.url === templateImageUrl ? size : null;
  const style = fitted
    ? ({ width: `${fitted.width}px`, height: `${fitted.height}px`, '--pw': fitted.width } as React.CSSProperties)
    : undefined;

  return (
    <div ref={containerRef} className="se-poster-preview" style={style} data-testid="poster-preview">
      <img key={templateImageUrl} ref={imgRef} src={templateImageUrl} alt={templateNo} onLoad={fit} />
      <div className="se-poster-overlay">
        <div className="se-poster-notice-text">{noticeText}</div>
        <div className="se-poster-date-text">{dateText}</div>
        <div className="se-poster-remarks-text">{remarks}</div>
        <div className="se-poster-vendor-text">
          <span>{vendorName}</span>
          <span>{emergencyContact}</span>
        </div>
      </div>
    </div>
  );
}
