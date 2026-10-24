import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { DbEntry } from '@/types/database';
import { csvEntries } from '../__fixtures__/csvEntries';
import {
  CSV_HEADERS,
  customImageBaseName,
  downloadCsv,
  filterApprovedEntries,
  generateAdminCsv,
} from '../csv';
import { downloadCustomImages as v2DownloadCustomImages } from '../zipDownload';

/**
 * v1 本番出力（js/admin-export.js）と v2 の CSV・ZIP がバイト一致することを確かめるゴールデンテスト。
 * v1 のモジュールを直接 import し、画面依存の ui-utils と supabase 依存の admin-settings だけスタブにする。
 */

const settings = vi.hoisted(() => ({ display_time_default: '10' as string | undefined }));

vi.mock('../../../../js/ui-utils.js', () => ({ showToast: vi.fn() }));
vi.mock('../../../../js/admin-settings.js', () => ({ getAppSettings: () => settings }));

// v2 は取りに行く URL をこのプロジェクトの poster-images に限る（v1 には無い、意図した違い。zipDownload.test で確かめる）。
// ここでは対象とファイル名の一致だけを見るので、URL の判定は素通しにする
vi.mock('@/lib/posterUrl', () => ({ safePosterUrl: (url: string | null | undefined) => url || null }));

// v2 の ZIP は jszip / file-saver を動的 import する。ファイル名だけ記録する
const zipLog = vi.hoisted(() => ({ files: [] as string[], saved: [] as string[] }));
vi.mock('jszip', () => ({
  default: class {
    file(name: string) {
      zipLog.files.push(name);
    }
    async generateAsync() {
      return new Blob(['zip']);
    }
  },
}));
vi.mock('file-saver', () => ({
  saveAs: (_blob: Blob, name: string) => {
    zipLog.saved.push(name);
  },
}));

// @ts-expect-error v1 の素の JS モジュール（型宣言なし）を同等性比較のためだけに読む
import * as v1 from '../../../../js/admin-export.js';

// UTC 2026-10-14 15:30:00 = JST 2026-10-15 00:30:00。UTC 日付とローカル日付が食い違う時刻で
// 変更日（UTC）と変更日時（ローカル時刻）の混在まで一致することを見る
const FIXED_NOW = new Date('2026-10-14T15:30:00Z');

const byteHex = async (blob: Blob) => Buffer.from(await blob.arrayBuffer()).toString('hex');

describe('CSV parity with v1 admin-export.js', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(FIXED_NOW);
    settings.display_time_default = '10';
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('runs in Asia/Tokyo', () => {
    expect(new Date(0).getTimezoneOffset()).toBe(-540);
  });

  it('filters to approved statuses the same way as v1', () => {
    const v1Ids = v1.getFilteredExportEntries(csvEntries).map((e: DbEntry) => e.id);
    const v2Ids = filterApprovedEntries(csvEntries).map((e) => e.id);
    expect(v2Ids).toEqual(v1Ids);
    expect(v2Ids).toHaveLength(4);
    expect(v2Ids.some((id) => id?.startsWith('5555') || id?.startsWith('6666'))).toBe(false);
  });

  it('generates byte-identical CSV for approved entries', () => {
    const approved = filterApprovedEntries(csvEntries);
    const expected: string = v1.generateCSV(approved);
    const actual = generateAdminCsv(approved, settings.display_time_default);
    expect(actual).toBe(expected);

    // 一致しているだけでなく、仕様の要所が入っていることも確認する
    const lines = actual.split('\n');
    expect(lines[0]).toBe(CSV_HEADERS.join(','));
    expect(lines[0]!.split(',')[3]).toBe('受注先名');
    expect(actual).toContain(',2026/10/14,');
    expect(actual).toContain('2026/10/14 [00:30:00]');
    expect(actual).toContain(customImageBaseName(csvEntries[1]!));
    expect(actual).toContain(',h0003C00,');
    expect(actual).toContain('0:00:10'); // display_duration 空 → 設定値
  });

  it('端末ID が空の申請（端末の無い物件の予定行から。F7）は端末ID を空欄にし、列はずれない', () => {
    // 案内文・備考の改行（クォート内の CRLF）を入れず、1行で列を数える
    const entry = { ...csvEntries[0]!, terminal_id: '', announcement: '', remarks: '' };
    const [header, line] = generateAdminCsv([entry], settings.display_time_default)
      .split('\n')
      .map((l) => l.split(','));
    expect(line).toHaveLength(header!.length);
    expect(header![1]).toBe('端末ID');
    expect(line![1]).toBe('');
    expect(line![2]).toBe(entry.property_code);
  });

  it('matches v1 per row, including every single-entry case', () => {
    for (const entry of csvEntries) {
      expect(generateAdminCsv([entry], settings.display_time_default)).toBe(v1.generateCSV([entry]));
    }
  });

  it('falls back to 6 seconds the same way when display_time_default is unset', () => {
    settings.display_time_default = undefined;
    const approved = filterApprovedEntries(csvEntries);
    expect(generateAdminCsv(approved, undefined)).toBe(v1.generateCSV(approved));
    expect(generateAdminCsv(approved, undefined)).toContain('0:00:06');
  });

  it('returns empty string for no entries', () => {
    expect(generateAdminCsv([], '10')).toBe(v1.generateCSV([]));
  });

  it('builds the same BOM-prefixed download blob as v1 exportCSV', async () => {
    const blobs: Blob[] = [];
    const createSpy = vi.spyOn(URL, 'createObjectURL').mockImplementation((b) => {
      blobs.push(b as Blob);
      return 'blob:test';
    });
    const revokeSpy = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
    const clickSpy = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});

    v1.exportCSV(csvEntries);
    downloadCsv(generateAdminCsv(filterApprovedEntries(csvEntries), settings.display_time_default), 'x.csv');

    expect(blobs).toHaveLength(2);
    expect(blobs[1]!.type).toBe(blobs[0]!.type);
    const [v1Hex, v2Hex] = [await byteHex(blobs[0]!), await byteHex(blobs[1]!)];
    expect(v1Hex.startsWith('efbbbf')).toBe(true);
    expect(v2Hex).toBe(v1Hex);

    createSpy.mockRestore();
    revokeSpy.mockRestore();
    clickSpy.mockRestore();
  });

  it('puts the same file names (except the extension, which follows the image) in the custom image ZIP as v1', async () => {
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockImplementation(async () => new Response(new Blob(['img'])));
    const createSpy = vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:test');
    const revokeSpy = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
    const clickSpy = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});

    const v1Files: string[] = [];
    let v1ZipName = '';
    const origCreate = document.createElement.bind(document);
    const elSpy = vi.spyOn(document, 'createElement').mockImplementation((tag: string) => {
      const el = origCreate(tag);
      if (tag === 'a') {
        vi.spyOn(el as HTMLAnchorElement, 'click').mockImplementation(() => {
          v1ZipName = (el as HTMLAnchorElement).download;
        });
      }
      return el;
    });
    // v1 は JSZip をグローバルから使う
    (globalThis as Record<string, unknown>).JSZip = class {
      file(name: string) {
        v1Files.push(name);
      }
      async generateAsync() {
        return new Blob(['zip']);
      }
    };

    zipLog.files = [];
    zipLog.saved = [];
    await v1.downloadCustomImages(csvEntries);
    const count = await v2DownloadCustomImages(csvEntries as DbEntry[]);

    expect(v1Files).toEqual([`${customImageBaseName(csvEntries[1]!)}.jpg`]); // draft の追加画像は除外
    // 拡張子だけは v1 と意図して違う: v1 は .jpg 固定で PNG の貼紙も .jpg になっていた。v2 は URL（無ければ中身）に合わせる
    // （修正依頼1024 本番確認 ④）。拡張子を除いた名前（CSV の点検案内TPLNo と一致させる部分）と対象は v1 と同じ
    expect(zipLog.files).toEqual([`${customImageBaseName(csvEntries[1]!)}.png`]);
    expect(zipLog.files.map((f) => f.replace(/\.[^.]+$/, ''))).toEqual(v1Files.map((f) => f.replace(/\.[^.]+$/, '')));
    expect(zipLog.saved).toEqual([v1ZipName]);
    expect(count).toBe(1);

    delete (globalThis as Record<string, unknown>).JSZip;
    elSpy.mockRestore();
    fetchSpy.mockRestore();
    createSpy.mockRestore();
    revokeSpy.mockRestore();
    clickSpy.mockRestore();
  });
});
