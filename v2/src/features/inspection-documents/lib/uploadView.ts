import type { ReviewReason } from './uploadRows';

/*
 * ファイルアップロードの画面で使う計算（修正依頼1104。業務システムの uploadView.ts を写した。テストできるよう .ts に分けた）。
 * - renderWidthFor: プレビューを描く幅（E8）
 * - clampLeftWidth: 左右の幅を変えるバーの左の幅（E9）
 * - submitGate: 登録の止め方（E1。入力漏れは止め、食い違いの要確認は確認ダイアログで通す）
 */

/** 描く幅の上限（px）。字がつぶれないよう 1029 の 900 から上げた */
export const MAX_RENDER_WIDTH = 1600;

/**
 * 表示幅 width（CSS px）のページを描く canvas の幅。倍率は max(2, 画面の倍率)・上限 3（画面の倍率が 1 の環境でも 2 倍で描く）。
 * バーを動かすたびに描き直さないよう 50px 刻みに丸める
 */
export function renderWidthFor(width: number, dpr: number = typeof window === 'undefined' ? 1 : window.devicePixelRatio || 1): number {
  const scale = Math.min(3, Math.max(2, dpr));
  return Math.min(MAX_RENDER_WIDTH, Math.ceil((width * scale) / 50) * 50);
}

/** 左（プレビュー）の最小幅 22.5rem・右（表）の最小幅 20rem（px。1rem=16px） */
export const LEFT_MIN_PX = 360;
export const RIGHT_MIN_PX = 320;

/** 左の幅を、左の最小・右の最小に収める（container は2列とバー・すき間を合わせた幅、chrome はバーとすき間の幅） */
export function clampLeftWidth(left: number, container: number, chrome: number): number {
  const max = Math.max(LEFT_MIN_PX, container - chrome - RIGHT_MIN_PX);
  return Math.round(Math.min(max, Math.max(LEFT_MIN_PX, left)));
}

/**
 * 送る行を、止める行（入力漏れ＝error を含む）と確認のうえ送る行（食い違いの要確認だけ）に分ける。
 * reasons は行の鍵 → 要確認の理由（reviewReasons の結果）
 */
export function submitGate(
  keys: readonly string[],
  reasons: Readonly<Record<string, readonly ReviewReason[] | undefined>>,
): { blocking: string[]; confirmable: string[] } {
  const blocking: string[] = [];
  const confirmable: string[] = [];
  for (const k of keys) {
    const rs = reasons[k] ?? [];
    if (rs.some((r) => r.kind === 'error')) blocking.push(k);
    else if (rs.length > 0) confirmable.push(k);
  }
  return { blocking, confirmable };
}
