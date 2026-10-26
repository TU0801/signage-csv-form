import { supabase, TABLES, RPC, BUCKETS } from '@/lib/supabase';
import type {
  DbInspectionReport,
  InspectionTypeFlagRow,
  ManagementCompanyRow,
  NotifyOffRow,
  PortalEntryUnitRow,
  ManagementCompanyShortNameRow,
  PortalEntryRow,
  PortalInspectionRow,
  PortalUnitRow,
} from '@/types/portal';
import type { DbEntry } from '@/types/database';

/** 範囲内の点検行の号機（台）と設備会社固有コード（修正依頼1025 H1〜H3） */
export async function fetchPortalInspectionUnits(): Promise<PortalUnitRow[]> {
  const { data, error } = await supabase.rpc(RPC.portalInspectionUnits);
  if (error) throw error;
  return (data ?? []) as PortalUnitRow[];
}

/** 台ごとの申請の台（修正依頼1026 I7）。範囲は portal_entries と同じ */
export async function fetchPortalEntryUnits(): Promise<PortalEntryUnitRow[]> {
  const { data, error } = await supabase.rpc(RPC.portalEntryUnits);
  if (error) throw error;
  return (data ?? []) as PortalEntryUnitRow[];
}

/** 点検日連絡が OFF の点検行・台（業務システムの notify_inspection_date。修正依頼1026）。範囲は inspection_in_scope */
export async function fetchNotifyOff(): Promise<NotifyOffRow[]> {
  const { data, error } = await supabase.rpc(RPC.portalInspectionNotifyOff);
  if (error) throw error;
  return (data ?? []) as NotifyOffRow[];
}

/** 申請済み（承認前）の申請を修正のために読む（申請者・同じ保守会社・管理者。修正依頼1026 I11） */
export async function fetchSubmittedEntryForEdit(entryId: string): Promise<DbEntry> {
  const { data, error } = await supabase.rpc(RPC.portalEntryForEdit, { p_entry_id: entryId });
  if (error) throw error;
  return data as DbEntry;
}

/** 申請済み（承認前）の申請を直す。patch は直せる列だけ（DB が列と状態・権限を確かめる）。状態は申請済みのまま */
export async function updateSubmittedEntry(entryId: string, patch: Record<string, unknown>): Promise<DbEntry> {
  const { data, error } = await supabase.rpc(RPC.portalUpdateSubmittedEntry, { p_entry_id: entryId, p_patch: patch });
  if (error) throw error;
  return data as DbEntry;
}

/** 点検種別の印（申請不要・毎月。修正依頼1025 H4/G4）。読めるのは管理者・保守会社・管理会社 */
export async function fetchInspectionTypeFlags(): Promise<InspectionTypeFlagRow[]> {
  const { data, error } = await supabase.from(TABLES.inspectionTypeFlags).select('inspection_type_id, report_only, monthly');
  if (error) throw error;
  return (data ?? []) as InspectionTypeFlagRow[];
}

/** 点検種別の印を保存する（管理者だけ。RLS が弾く）。両方 false でも行は残す（行が無いのと同じ意味） */
export async function saveInspectionTypeFlags(
  inspectionTypeId: string,
  flags: { report_only: boolean; monthly: boolean },
): Promise<void> {
  const { error } = await supabase
    .from(TABLES.inspectionTypeFlags)
    .upsert(
      { inspection_type_id: inspectionTypeId, report_only: flags.report_only, monthly: flags.monthly },
      { onConflict: 'inspection_type_id' },
    );
  if (error) throw error;
}

/** 管理会社の略称（F5。範囲は management_companies_scoped と同じ＋管理会社アカウントの自社） */
export async function fetchManagementCompanyShortNames(): Promise<ManagementCompanyShortNameRow[]> {
  const { data, error } = await supabase.rpc(RPC.managementCompanyShortNames);
  if (error) throw error;
  return (data ?? []) as ManagementCompanyShortNameRow[];
}

/*
 * 点検ポータル（管理会社・保守会社の点検一覧／申請の承認・差戻し／点検報告書）の読み書き。
 * 範囲の絞り込みと権限は DB 側（scripts/inspection-portal.sql の RPC・RLS・Storage ポリシー）が持つ。
 * ここでは呼び出しと型付けだけを行う。
 */

export async function fetchPortalInspections(): Promise<PortalInspectionRow[]> {
  const { data, error } = await supabase.rpc(RPC.portalInspections);
  if (error) throw error;
  return (data ?? []) as PortalInspectionRow[];
}

export async function fetchPortalEntries(): Promise<PortalEntryRow[]> {
  const { data, error } = await supabase.rpc(RPC.portalEntries);
  if (error) throw error;
  return (data ?? []) as PortalEntryRow[];
}

/**
 * 差戻し（draft・ready → pending、理由必須）。管理会社は自社物件だけ、管理者は全件。
 * 承認はここからは出せない（DB が 42501 で断る）。見た版を渡す approveEntryChecked を使う
 */
export type EntryReviewAction = 'send_back';

export async function reviewEntry(entryId: string, action: EntryReviewAction, comment?: string): Promise<DbEntry> {
  const { data, error } = await supabase.rpc(RPC.portalReviewEntry, {
    p_entry_id: entryId,
    p_action: action,
    p_comment: comment ?? null,
  });
  if (error) throw error;
  return data as DbEntry;
}

/**
 * 見た版の申請だけを承認する（修正依頼1026 I11）。承認前の申請は保守会社が直せるので、画面が読んだ updated_at と違えば DB が断る
 * （portal_approve_entry_checked。範囲は portal_review_entry と同じ）。差戻しは reviewEntry のまま
 */
export async function approveEntryChecked(entryId: string, expectedUpdatedAt: string | null): Promise<DbEntry> {
  const { data, error } = await supabase.rpc(RPC.portalApproveEntryChecked, {
    p_entry_id: entryId,
    p_expected_updated_at: expectedUpdatedAt,
  });
  if (error) throw error;
  return data as DbEntry;
}

/** 範囲内の点検報告書（RLS で絞られる）。削除済みも返す（画面の「削除済みを表示」で使う） */
export async function fetchInspectionReports(): Promise<DbInspectionReport[]> {
  const { data, error } = await supabase
    .from(TABLES.inspectionReports)
    .select('*')
    .order('performed_on', { ascending: false })
    .order('created_at', { ascending: false });
  if (error) throw error;
  return (data ?? []) as DbInspectionReport[];
}

export interface RegisterReportInput {
  inspectionId: string;
  /** 何月分の点検か（YYYY-MM-01）。省略すると実施日の月 */
  targetMonth: string | null;
  /** 実施日（YYYY-MM-DD） */
  performedOn: string;
  /** 表示用のファイル名（buildReportFileName で作る。重なれば DB 側で _2 などを付ける） */
  fileName: string;
  file: File;
  entryId?: string | null;
  note?: string | null;
}

/** SHA-256（16進）。同じファイルの二重提出を見分ける */
export async function sha256Hex(file: Blob): Promise<string> {
  const buf = await file.arrayBuffer();
  const digest = await crypto.subtle.digest('SHA-256', buf);
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Storage へ置いてから報告書として登録する。置き場所のキーは ASCII（{点検行ID}/{uuid}.pdf）で、
 * 日本語の表示名は DB に持つ。登録に失敗したファイルは Storage に残る（利用者は消せない。管理者が整理する）
 */
export async function registerInspectionReport(input: RegisterReportInput): Promise<DbInspectionReport> {
  const path = `${input.inspectionId}/${crypto.randomUUID()}.pdf`;
  const hash = await sha256Hex(input.file);
  const { error: uploadError } = await supabase.storage
    .from(BUCKETS.inspectionReports)
    .upload(path, input.file, { contentType: 'application/pdf', upsert: false });
  if (uploadError) throw uploadError;
  const { data, error } = await supabase.rpc(RPC.portalRegisterReport, {
    p_inspection_id: input.inspectionId,
    p_target_month: input.targetMonth,
    p_performed_on: input.performedOn,
    p_file_name: input.fileName,
    p_storage_path: path,
    p_original_name: input.file.name,
    p_size_bytes: input.file.size,
    p_content_hash: hash,
    p_entry_id: input.entryId ?? null,
    p_note: input.note ?? null,
  });
  if (error) throw error;
  return data as DbInspectionReport;
}

export type ReportUpdateAction = 'edit' | 'delete' | 'restore';

export interface ReportEdit {
  performedOn?: string | null;
  targetMonth?: string | null;
  fileName?: string | null;
  note?: string | null;
}

/** 提出者（保守会社）・管理者による修正、削除（論理）、復元 */
export async function updateInspectionReport(
  reportId: string,
  action: ReportUpdateAction,
  edit: ReportEdit = {},
): Promise<DbInspectionReport> {
  const { data, error } = await supabase.rpc(RPC.portalUpdateReport, {
    p_report_id: reportId,
    p_action: action,
    p_performed_on: edit.performedOn ?? null,
    p_target_month: edit.targetMonth ?? null,
    p_file_name: edit.fileName ?? null,
    p_note: edit.note ?? null,
  });
  if (error) throw error;
  return data as DbInspectionReport;
}

export type ReportReviewAction = 'accept' | 'return';

/** 管理会社・管理者による受領・差戻し（差戻しは理由必須） */
export async function reviewInspectionReport(
  reportId: string,
  action: ReportReviewAction,
  comment?: string,
): Promise<DbInspectionReport> {
  const { data, error } = await supabase.rpc(RPC.portalReviewReport, {
    p_report_id: reportId,
    p_action: action,
    p_comment: comment ?? null,
  });
  if (error) throw error;
  return data as DbInspectionReport;
}

/**
 * プレビュー・ダウンロード用の署名付き URL（有効 10 分）。download にファイル名を渡すと、その名前で保存される。
 * storage_backend が 'archive' のもの（将来の階層化で別のストレージへ移したもの）はここで分岐させる
 */
export async function reportSignedUrl(
  report: Pick<DbInspectionReport, 'storage_path' | 'storage_backend' | 'file_name'>,
  opts: { download?: boolean } = {},
): Promise<string> {
  if (report.storage_backend !== 'supabase') {
    throw new Error('この報告書は保管用のストレージへ移されています（管理者にお問い合わせください）');
  }
  const { data, error } = await supabase.storage
    .from(BUCKETS.inspectionReports)
    .createSignedUrl(report.storage_path, 600, opts.download ? { download: report.file_name } : undefined);
  if (error) throw error;
  return data.signedUrl;
}

/** ZIP 用に本体を取り出す */
export async function downloadReportBlob(report: Pick<DbInspectionReport, 'storage_path' | 'storage_backend'>): Promise<Blob> {
  if (report.storage_backend !== 'supabase') {
    throw new Error('この報告書は保管用のストレージへ移されています（管理者にお問い合わせください）');
  }
  const { data, error } = await supabase.storage.from(BUCKETS.inspectionReports).download(report.storage_path);
  if (error) throw error;
  return data;
}

/** 管理会社の一覧（ユーザー管理で管理会社アカウントを作る・付け替えるとき。管理者だけ行が返る） */
export async function fetchManagementCompanies(): Promise<ManagementCompanyRow[]> {
  const { data, error } = await supabase.rpc(RPC.managementCompaniesMaster);
  if (error) throw error;
  return (data ?? []) as ManagementCompanyRow[];
}
