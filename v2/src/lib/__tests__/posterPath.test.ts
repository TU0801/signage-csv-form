import { describe, it, expect } from 'vitest';
import { notHeld, ownPosterPath, rowDetailDiscards } from '../posterPath';

const BASE = 'https://x.supabase.co/storage/v1/object/public/poster-images/';

describe('posterPath（使われない貼紙画像の片付け）', () => {
  it('消してよいのは自分のフォルダ直下の画像だけ（テンプレート・広告・他人・.. を含む名前・バケット外は対象外）', () => {
    expect(ownPosterPath(`${BASE}u1/1700_ab_12.png`, 'u1')).toBe('u1/1700_ab_12.png');
    expect(ownPosterPath(`${BASE}u1/1700_ab.png?v=3`, 'u1')).toBe('u1/1700_ab.png');
    expect(ownPosterPath(`${BASE}u2/1700_ab.png`, 'u1')).toBeNull();
    expect(ownPosterPath(`${BASE}templates/fire.png`, 'u1')).toBeNull();
    expect(ownPosterPath(`${BASE}ads/slot_1.png`, 'u1')).toBeNull();
    expect(ownPosterPath(`${BASE}u1/../templates/fire.png`, 'u1')).toBeNull();
    expect(ownPosterPath(`${BASE}u1/sub/a.png`, 'u1')).toBeNull();
    expect(ownPosterPath('https://example.com/u1/a.png', 'u1')).toBeNull();
    expect(ownPosterPath(`${BASE}u1/a.png`, null)).toBeNull();
  });

  it('候補から、まだ持たれている URL・空・重複を除く', () => {
    expect(notHeld(['a', 'b', 'a', '', null, 'c'], ['b', undefined])).toEqual(['a', 'c']);
  });

  it('詳細設定を閉じたときの片付け: 保存なら残す画像以外、キャンセルならアップロードした分だけ', () => {
    // 保存（old → mid → final）
    expect(rowDetailDiscards({ original: 'old', uploaded: ['mid', 'final'], kept: 'final' })).toEqual(['mid', 'old']);
    // キャンセル（kept＝開いたときの画像）
    expect(rowDetailDiscards({ original: 'old', uploaded: ['mid', 'final'], kept: 'old' })).toEqual(['mid', 'final']);
    // テンプレートに戻して保存
    expect(rowDetailDiscards({ original: 'old', uploaded: [], kept: '' })).toEqual(['old']);
    // 何も変えずに閉じた
    expect(rowDetailDiscards({ original: 'old', uploaded: [], kept: 'old' })).toEqual([]);
  });
});
