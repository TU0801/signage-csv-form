import { describe, it, expect, vi } from 'vitest';
import type { CsvSourceEntry } from '../csv';

vi.mock('@/lib/supabase', () => ({ SUPABASE_URL: 'https://example.supabase.co', supabase: {}, TABLES: {}, RPC: {} }));

import { CSV_HEADERS, generateAdminCsv } from '../csv';
import { customImageFiles } from '../customImageFiles';
import { parseExtraPosters } from '../extraPosters';
import { isServablePosterUrl } from '../posterUrl';

const URL_OF = (p: string) => `https://example.supabase.co/storage/v1/object/public/poster-images/${p}`;

const base: CsvSourceEntry = {
  id: 'abcdef12-0000-4000-8000-000000000001',
  status: 'ready',
  inspection_co: 7,
  terminal_id: 'h0001A00',
  property_code: '2010',
  vendor_name: '山田エレベーター',
  emergency_contact: '03-1234-5678',
  inspection_type: 'エレベーター定期点検',
  template_no: '1',
  inspection_start: '2026-11-01',
  inspection_end: '2026-11-02',
  display_start_date: '2026-10-25',
  display_end_date: '2026-11-02',
  display_duration: 8,
  remarks: '10時〜12時',
  announcement: 'ご協力をお願いします',
  poster_type: 'template',
  poster_position: '1',
  poster_image: null,
};

/** CSV の行を見出しの名前で引ける形にする（クォートの無い値だけを使う） */
function rowsOf(csv: string): Record<string, string>[] {
  const [, ...lines] = csv.split('\n');
  return lines.map((line) => Object.fromEntries(line.split(',').map((v, i) => [CSV_HEADERS[i], v])));
}

describe('2枚目以降の貼紙（修正依頼1025 D3）', () => {
  it('管理画面の CSV は枚数分の行に展開する（同じ物件・端末・表示期間、貼紙区分は追加、点検案内TPLNo は _2 から、位置は指定か1枚目と同じ）', () => {
    const csv = generateAdminCsv(
      [
        {
          ...base,
          remarks: '',
          extra_posters: [
            { image_url: URL_OF('library/common/a.png'), source: 'library', library_id: 'L1' },
            { image_url: URL_OF('u1/b.png'), source: 'upload', position: '0' },
          ],
        },
      ],
      '10',
    );
    const rows = rowsOf(csv);
    expect(rows).toHaveLength(3);
    expect(rows[0]).toMatchObject({ 点検工事案内: 'エレベーター定期点検', 点検案内TPLNo: '1', 貼紙区分: 'テンプレート', frame_No: '1' });
    expect(rows[1]).toMatchObject({
      端末ID: 'h0001A00',
      物件コード: '2010',
      点検工事案内: '',
      点検案内TPLNo: '2010_エレベーター定期点検_abcdef12_2',
      点検開始日: '',
      掲示板用案内文: '',
      frame_No: '1',
      表示開始日: '2026/10/25',
      表示終了日: '2026/11/02',
      表示時間: '0:00:08',
      貼紙区分: '追加',
    });
    expect(rows[2]).toMatchObject({ 点検案内TPLNo: '2010_エレベーター定期点検_abcdef12_3', frame_No: '0', 貼紙区分: '追加' });
    // 追加の貼紙が無い行は今までどおり1行
    expect(rowsOf(generateAdminCsv([base], '10'))).toHaveLength(1);
  });

  it('管理画面の CSV は、追加画像 ZIP に入らない URL（よそのサイト）の2枚目以降の貼紙の行を出さない（番号は ZIP と同じ数え方）', () => {
    const csv = generateAdminCsv(
      [
        {
          ...base,
          extra_posters: [
            { image_url: 'https://evil.example/storage/v1/object/public/poster-images/u1/x.png', source: 'upload' },
            { image_url: URL_OF('u1/b.png'), source: 'upload' },
          ],
        },
      ],
      '10',
      isServablePosterUrl,
    );
    expect(rowsOf(csv).map((r) => r.点検案内TPLNo)).toEqual(['1', '2010_エレベーター定期点検_abcdef12_3']);
  });

  it('追加画像の ZIP のファイルは1枚目の追加画像と2枚目以降で、名前は CSV の点検案内TPLNo と同じ。よそのURL・形の合わない要素は外す', () => {
    const files = customImageFiles({
      ...base,
      id: base.id!,
      property_code: '2010',
      inspection_type: '追加画像',
      poster_type: 'custom',
      poster_image: URL_OF('u1/main.png'),
      extra_posters: [
        { image_url: URL_OF('u1/b.png'), source: 'upload' },
        { image_url: 'https://evil.example/x.png', source: 'upload' },
        { source: 'upload' },
      ] as never,
    });
    expect(files).toEqual([
      { url: URL_OF('u1/main.png'), baseName: '2010_追加画像_abcdef12' },
      { url: URL_OF('u1/b.png'), baseName: '2010_追加画像_abcdef12_2' },
    ]);
    expect(parseExtraPosters(null)).toEqual([]);
    expect(parseExtraPosters([{ image_url: 'x', source: 'library', position: '9' }])).toEqual([
      { image_url: 'x', source: 'library' },
    ]);
  });
});
