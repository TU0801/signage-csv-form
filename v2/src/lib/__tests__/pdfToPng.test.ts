import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { containFit, isPdfFile, preparePosterImage } from '../pdfToPng';
import { POSTER_PNG_SIZE } from '../constants';

vi.mock('@/lib/supabase', () => ({ supabase: {} }));

// pdfjs-dist（legacy ビルド。修正依頼1024 F5）は jsdom で動かないので、ページの大きさとページ数だけ返す偽物にする
const pdf = vi.hoisted(() => ({ numPages: 1, width: 595, height: 842, render: vi.fn() }));
vi.mock('pdfjs-dist/legacy/build/pdf.mjs', () => ({
  GlobalWorkerOptions: { workerSrc: '' },
  getDocument: () => ({
    promise: Promise.resolve({
      numPages: pdf.numPages,
      getPage: async () => ({
        getViewport: ({ scale }: { scale: number }) => ({ width: pdf.width * scale, height: pdf.height * scale }),
        render: (p: unknown) => {
          pdf.render(p);
          return { promise: Promise.resolve() };
        },
      }),
    }),
    destroy: async () => {},
  }),
}));
vi.mock('pdfjs-dist/legacy/build/pdf.worker.min.mjs?url', () => ({ default: '/pdf.worker.js' }));

describe('PDF → 貼紙 PNG（修正依頼1024 B18）', () => {
  const drawImage = vi.fn();
  const fillRect = vi.fn();
  let pngSize = 1000;

  beforeEach(() => {
    drawImage.mockClear();
    fillRect.mockClear();
    pdf.render.mockClear();
    pngSize = 1000;
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(
      () => ({ drawImage, fillRect, fillStyle: '' }) as unknown as CanvasRenderingContext2D,
    );
    vi.spyOn(HTMLCanvasElement.prototype, 'toBlob').mockImplementation(function (cb: BlobCallback) {
      cb(new Blob([new Uint8Array(pngSize)], { type: 'image/png' }));
    });
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('containFit は縦横比を保って枠に収め、余白を均等に付ける', () => {
    // A4 縦（595×842）→ 1080×1440: 幅で決まらず高さで決まる
    const a4 = containFit(595, 842, 1080, 1440);
    expect(a4.height).toBeCloseTo(1440);
    expect(a4.width).toBeCloseTo(595 * (1440 / 842));
    expect(a4.x).toBeCloseTo((1080 - a4.width) / 2);
    expect(a4.y).toBeCloseTo(0);
    // 横長（842×595）は幅で決まり、上下に余白
    const land = containFit(842, 595, 1080, 1440);
    expect(land.width).toBeCloseTo(1080);
    expect(land.y).toBeGreaterThan(0);
  });

  it('PDF かどうかは MIME と拡張子で見る', () => {
    expect(isPdfFile({ type: 'application/pdf', name: 'a' })).toBe(true);
    expect(isPdfFile({ type: '', name: '貼紙.PDF' })).toBe(true);
    expect(isPdfFile({ type: 'image/png', name: 'a.png' })).toBe(false);
  });

  it('複数ページの PDF は1ページ目を 1080×1440 の白背景 PNG にし、1ページ目を使うと知らせる', async () => {
    pdf.numPages = 3;
    const result = await preparePosterImage(new File(['%PDF-1.7'], '点検のお知らせ.pdf', { type: 'application/pdf' }));
    expect(result.file.type).toBe('image/png');
    expect(result.file.name).toBe('点検のお知らせ.png');
    expect(result.notice).toContain('1ページ目');
    // 白で塗ってから、収まる大きさで描いたページを真ん中に置く
    expect(fillRect).toHaveBeenCalledWith(0, 0, POSTER_PNG_SIZE.width, POSTER_PNG_SIZE.height);
    const [, x, y] = drawImage.mock.calls[0]!;
    const fit = containFit(595, 842, POSTER_PNG_SIZE.width, POSTER_PNG_SIZE.height);
    expect(x).toBe(Math.round((POSTER_PNG_SIZE.width - Math.round(fit.width)) / 2));
    expect(y).toBe(0);
  });

  it('1ページの PDF は知らせを出さず、変換後に 5MB を超えたら止める', async () => {
    pdf.numPages = 1;
    const ok = await preparePosterImage(new File(['%PDF'], 'a.pdf', { type: 'application/pdf' }));
    expect(ok.notice).toBeNull();
    pngSize = 5 * 1024 * 1024 + 1;
    await expect(preparePosterImage(new File(['%PDF'], 'a.pdf', { type: 'application/pdf' }))).rejects.toThrow('5MB');
  });

  it('PDF・PNG・JPEG 以外は変換せずに止める', async () => {
    await expect(preparePosterImage(new File(['x'], 'a.gif', { type: 'image/gif' }))).rejects.toThrow('JPG, JPEG, PNG');
    expect(pdf.render).not.toHaveBeenCalled();
  });
});
