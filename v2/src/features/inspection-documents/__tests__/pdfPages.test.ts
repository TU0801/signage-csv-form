import { describe, it, expect, vi, afterEach } from 'vitest';
import { openPdfPages } from '../lib/pdfPages';

// pdfjs-dist は jsdom で動かないので、getDocument に渡した引数だけを見る偽物にする
const getDocument = vi.hoisted(() =>
  vi.fn(() => ({ promise: Promise.resolve({ numPages: 18 }), destroy: async () => {} })),
);
vi.mock('pdfjs-dist/legacy/build/pdf.mjs', () => ({ GlobalWorkerOptions: { workerSrc: '' }, getDocument }));
vi.mock('pdfjs-dist/legacy/build/pdf.worker.min.mjs?url', () => ({ default: '/pdf.worker.js' }));

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('PDF のページ描画の wasm（修正依頼1027(4) 複合機の白黒スキャン PDF）', () => {
  it('CCITTFax・JBIG2 の画像を復号する jbig2.wasm を同梱の URL から取れるよう getDocument に渡す', async () => {
    const fetchMock = vi.fn(async () => new Response(new Uint8Array([0, 97, 115, 109])));
    vi.stubGlobal('fetch', fetchMock);
    await openPdfPages(new Uint8Array([1]));
    const params = (getDocument.mock.calls[0] as unknown as [{ BinaryDataFactory?: new () => { fetch: (a: object) => Promise<Uint8Array> } }])[0];
    expect(params.BinaryDataFactory).toBeDefined();
    const factory = new params.BinaryDataFactory!();
    const bytes = await factory.fetch({ kind: 'wasmUrl', filename: 'jbig2.wasm' });
    expect(bytes).toEqual(new Uint8Array([0, 97, 115, 109]));
    expect(String((fetchMock.mock.calls[0] as unknown[])[0])).toContain('jbig2');
  });
});
