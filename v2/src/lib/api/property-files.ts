import { FunctionsHttpError } from '@supabase/supabase-js';
import { supabase, BUCKETS, EDGE_FUNCTIONS, RPC, TABLES } from '@/lib/supabase';
import type { DbPropertyFile, PropertyFileCategory } from '@/types/portal';
import type { AiOcrRaw, CorrectionRecord, CorrectionRow } from '@/features/inspection-documents/lib/aiOcr';
import { sha256Hex } from './portal';

/*
 * その他ファイル（見積書・請求書・契約書・建物関連情報・提案書・写真・その他。修正依頼1025 G2）と AI-OCR（G4）の読み書き。
 * 見える範囲（管理者・アップロードした会社・物件の管理会社）と書ける範囲は DB 側（scripts/fix-1025-reports.sql の RLS・RPC・
 * Storage ポリシー）が持つ。AI-OCR は Edge Function signage-ai-ocr（キー未設定なら 503）。
 */

/**
 * 範囲内のその他ファイル（RLS で絞られる。削除済みも返す）。can_delete は見ている人が削除できるか
 * （計算列 signage.property_file_can_delete。削除の RPC と同じ判定。scripts/fix-1029-upload.sql）
 */
export async function fetchPropertyFiles(): Promise<DbPropertyFile[]> {
  const { data, error } = await supabase
    .from(TABLES.propertyFiles)
    .select('*, can_delete:property_file_can_delete')
    .order('created_at', { ascending: false });
  if (error) throw error;
  return (data ?? []) as DbPropertyFile[];
}

/** その他ファイルを置ける建物（管理者は全件・保守会社は自社の点検がある物件・管理会社は点検行の無いものを含む自社物件） */
export async function fetchPropertyFileTargets(): Promise<{ code: string; name: string }[]> {
  const { data, error } = await supabase.rpc(RPC.portalPropertyFileTargets);
  if (error) throw error;
  return ((data ?? []) as { property_code: string; property_name: string }[]).map((r) => ({
    code: r.property_code,
    name: r.property_name,
  }));
}

/**
 * ファイル名からの自動入力に使う物件の名前（修正依頼1029(1)）。範囲は「置ける建物」と同じ。
 * 業務システムの物件名・物件名略称・サイネージ名を添える（RPC portal_upload_property_aliases。scripts/fix-1029-upload.sql）
 */
export async function fetchUploadPropertyAliases(): Promise<
  { code: string; name: string; aliases: string[]; managementCompanyId: string | null }[]
> {
  const { data, error } = await supabase.rpc(RPC.portalUploadPropertyAliases);
  if (error) throw error;
  return (
    (data ?? []) as {
      property_code: string;
      property_name: string;
      biz_name: string | null;
      biz_name_short: string | null;
      signage_name: string | null;
      management_company_id: string | null;
    }[]
  ).map((r) => ({
    code: r.property_code,
    name: r.property_name,
    aliases: [r.biz_name, r.biz_name_short, r.signage_name].filter((v): v is string => !!v),
    managementCompanyId: r.management_company_id,
  }));
}

/** ファイル名からの自動入力に使う保守会社の取引先名・略称（範囲内だけ。RPC portal_upload_vendor_aliases） */
export async function fetchUploadVendorAliases(): Promise<{ id: string; name: string; shortName: string | null }[]> {
  const { data, error } = await supabase.rpc(RPC.portalUploadVendorAliases);
  if (error) throw error;
  return ((data ?? []) as { id: string; name: string; short_name: string | null }[]).map((r) => ({
    id: r.id,
    name: r.name,
    shortName: r.short_name,
  }));
}

export interface RegisterPropertyFileInput {
  propertyCode: string;
  category: PropertyFileCategory;
  categoryNote: string | null;
  /** 表示名（禁止文字を除いたもの） */
  fileName: string;
  file: File;
  docDate: string | null;
  note: string | null;
  /** AI-OCR で読んだ結果（人が直す前）。読んでいなければ null */
  ocrResult?: unknown;
  /** 保守会社（管理者が選んだもの。DB は管理者のときだけ使い、保守会社のアカウントは自社・管理会社は無しに固定する） */
  vendorId?: string | null;
}

/** 置き場所の拡張子（ASCII の英数字だけ。無ければ bin） */
export function storageExtension(fileName: string): string {
  const m = /\.([A-Za-z0-9]{1,8})$/.exec(fileName);
  return m?.[1] ? m[1].toLowerCase() : 'bin';
}

/**
 * Storage へ置いてから登録する。置き場所は {物件コード}/{uuid}.{拡張子}（日本語の表示名は DB に持つ）。
 * 登録に失敗したファイルは Storage に残る（利用者は消せない。管理者が整理する）
 */
export async function registerPropertyFile(input: RegisterPropertyFileInput): Promise<DbPropertyFile> {
  const path = `${input.propertyCode}/${crypto.randomUUID()}.${storageExtension(input.file.name)}`;
  const hash = await sha256Hex(input.file);
  const { error: uploadError } = await supabase.storage
    .from(BUCKETS.propertyFiles)
    .upload(path, input.file, { contentType: input.file.type || 'application/octet-stream', upsert: false });
  if (uploadError) throw uploadError;
  const { data, error } = await supabase.rpc(RPC.portalRegisterPropertyFile, {
    p_property_code: input.propertyCode,
    p_category: input.category,
    p_category_note: input.categoryNote,
    p_file_name: input.fileName,
    p_storage_path: path,
    p_original_name: input.file.name,
    p_mime_type: input.file.type || 'application/octet-stream',
    p_size_bytes: input.file.size,
    p_content_hash: hash,
    p_doc_date: input.docDate,
    p_note: input.note,
    p_ocr_result: input.ocrResult ?? null,
    p_vendor_id: input.vendorId || null,
  });
  if (error) throw error;
  return data as DbPropertyFile;
}

/** 削除（論理）。管理者・アップロードした本人と会社（修正依頼1029 決定②） */
export async function deletePropertyFile(fileId: string): Promise<DbPropertyFile> {
  const { data, error } = await supabase.rpc(RPC.portalDeletePropertyFile, { p_file_id: fileId });
  if (error) throw error;
  return data as DbPropertyFile;
}

/** プレビュー・ダウンロード用の署名付き URL（有効 10 分） */
export async function propertyFileSignedUrl(
  file: Pick<DbPropertyFile, 'storage_path' | 'file_name'>,
  opts: { download?: boolean } = {},
): Promise<string> {
  const { data, error } = await supabase.storage
    .from(BUCKETS.propertyFiles)
    .createSignedUrl(file.storage_path, 600, opts.download ? { download: file.file_name } : undefined);
  if (error) throw error;
  return data.signedUrl;
}

// ---------------------------------------------------------------------------
// AI-OCR
// ---------------------------------------------------------------------------

/** 未設定（キーが無い・関数が配備されていない）ときに画面に出す文言（Edge Function の 503 と同じ） */
export const AI_OCR_NOT_CONFIGURED = 'AI-OCR は未設定です（管理者に連絡）';

export interface AiOcrStatus {
  configured: boolean;
  /** 使えないときの理由（画面に出す） */
  message: string | null;
}

async function invokeAiOcr<T>(body: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.functions.invoke(EDGE_FUNCTIONS.aiOcr, { body });
  if (error) {
    let message: string = error.message;
    if (error instanceof FunctionsHttpError) {
      try {
        const payload = (await error.context.json()) as { error?: string };
        message = payload.error || message;
      } catch {
        // 本文が JSON でない（関数が配備されていない等）ときは SDK のメッセージ
      }
    }
    throw new Error(message);
  }
  return data as T;
}

/** 使えるか（キーが入っているか）。関数が無い・通信に失敗したときも「未設定」として扱う */
export async function fetchAiOcrStatus(): Promise<AiOcrStatus> {
  try {
    const res = await invokeAiOcr<{ configured?: boolean }>({ action: 'status' });
    return res?.configured ? { configured: true, message: null } : { configured: false, message: AI_OCR_NOT_CONFIGURED };
  } catch (err) {
    console.warn('AI-OCR status check failed:', err);
    return { configured: false, message: AI_OCR_NOT_CONFIGURED };
  }
}

export type AiOcrRequest =
  | { mode: 'text'; pages: string[] }
  | { mode: 'pdf'; data: string }
  | { mode: 'image'; data: string; mediaType: 'image/jpeg' | 'image/png' };

/** 読み取り（失敗は Edge Function の日本語の理由で投げる） */
export async function readWithAiOcr(request: AiOcrRequest): Promise<AiOcrRaw> {
  const res = await invokeAiOcr<{ result: AiOcrRaw }>({ action: 'read', ...request });
  return res.result;
}

/** Uint8Array → base64（大きなファイルでも引数の上限に当たらないよう分けて変換する） */
export function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

/** 自己改善の辞書（範囲内の物件のものだけ返る） */
export async function fetchCorrectionDictionary(): Promise<CorrectionRow[]> {
  const { data, error } = await supabase.rpc(RPC.ocrCorrectionDictionary);
  if (error) throw error;
  return (data ?? []) as CorrectionRow[];
}

/** 人が確定した値を記録する（失敗しても登録は止めない。呼び出し側は待たなくてよい） */
export async function recordCorrections(records: CorrectionRecord[]): Promise<void> {
  if (records.length === 0) return;
  const { error } = await supabase.rpc(RPC.ocrRecordCorrections, { p_items: records.slice(0, 50) });
  if (error) console.warn('OCR correction record failed:', error.message);
}
