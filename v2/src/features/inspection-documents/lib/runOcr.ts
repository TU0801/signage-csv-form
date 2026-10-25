import { bytesToBase64, readWithAiOcr } from '@/lib/api/property-files';
import type { PdfPages } from './pdfPages';
import { extractRange, loadSourcePdf } from './pdfSplit';
import {
  AI_OCR_MAX_PDF_PAGES,
  AI_OCR_MAX_TEXT_PAGES,
  hasUsableTextLayer,
  readFromTextLayer,
  type AiOcrRaw,
} from './aiOcr';

/*
 * 読み取りの流れ（invoice-intake に倣う）: まず PDF の文字情報（テキスト層）を読み、十分なら文字だけを AI に送る。
 * 足りなければ（スキャン画像の PDF）先頭 AI_OCR_MAX_PDF_PAGES ページだけを切り出した PDF を送る。
 * useAi=false は文字情報だけで読む（費用なし。スキャン画像の PDF では何も読めない）
 */

export type OcrMode = 'text' | 'pdf' | 'image' | 'local';

export interface OcrReadResult {
  raw: AiOcrRaw;
  pageTexts: string[];
  mode: OcrMode;
  /** AI に送ったページ数（文字のときは読んだページ数） */
  pages: number;
}

export async function readPdfForOcr(pages: PdfPages, bytes: Uint8Array, useAi: boolean): Promise<OcrReadResult> {
  const pageTexts = await pages.pageTexts(AI_OCR_MAX_TEXT_PAGES);
  if (!useAi) return { raw: readFromTextLayer(pageTexts), pageTexts, mode: 'local', pages: pageTexts.length };
  if (hasUsableTextLayer(pageTexts)) {
    const raw = await readWithAiOcr({ mode: 'text', pages: pageTexts });
    return { raw, pageTexts, mode: 'text', pages: pageTexts.length };
  }
  const count = Math.min(pages.pageCount, AI_OCR_MAX_PDF_PAGES);
  const source = await loadSourcePdf(bytes);
  const head = await extractRange(source, { start: 0, end: count - 1 }, {});
  const raw = await readWithAiOcr({ mode: 'pdf', data: bytesToBase64(head) });
  return { raw, pageTexts, mode: 'pdf', pages: count };
}

/** 画像（JPEG・PNG）を AI で読む（文字情報が無いので AI だけ） */
export async function readImageForOcr(file: File): Promise<OcrReadResult> {
  const mediaType = file.type === 'image/png' ? 'image/png' : 'image/jpeg';
  const data = bytesToBase64(new Uint8Array(await file.arrayBuffer()));
  const raw = await readWithAiOcr({ mode: 'image', data, mediaType });
  return { raw, pageTexts: [], mode: 'image', pages: 1 };
}
